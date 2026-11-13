import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  nidaaSchemaReady: Promise<boolean> | undefined
}

/**
 * Dual database mode:
 *  - TURSO_CONNECTION_URL set (Vercel/production) -> Turso (libsql) via driver adapter
 *  - not set (local dev)                          -> the plain SQLite file from DATABASE_URL
 */
function makeDb(): PrismaClient {
  const tursoUrl = process.env.TURSO_CONNECTION_URL
  if (tursoUrl) {
    const adapter = new PrismaLibSQL({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    return new PrismaClient({ adapter })
  }
  return new PrismaClient()
}

export const db = globalForPrisma.prisma ?? makeDb()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// ---------------------------------------------------------------------------
// Idempotent schema bootstrap.
//
// Why: on Vercel there is no local Turso token, so `prisma db push` can never
// be run from the dev machine against production. Every new column added to
// prisma/schema.prisma used to require a manual SQL session against Turso,
// and forgetting it produced exactly the "save failed / Internal error" 500s.
// Now the runtime itself makes the database match the code on the first
// request after each deploy — IF NOT EXISTS + "duplicate column" tolerance
// make it safe to run on every cold start, from any lambda, concurrently.
// ---------------------------------------------------------------------------

const TABLE_DDL = [
  // Key-value settings: VAPID keys, internal config, etc.
  `CREATE TABLE IF NOT EXISTS "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
  )`,
  // Multi-user accounts.
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "fishApiKey" TEXT,
    "fishVoiceId" TEXT,
    "llmApiKey" TEXT,
    "llmBaseUrl" TEXT,
    "llmModel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // One row per voice call — scoped to its owner.
  `CREATE TABLE IF NOT EXISTS "Call" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'mcp',
    "taskName" TEXT NOT NULL,
    "summary" TEXT,
    "result" TEXT,
    "message" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" DATETIME,
    "endedAt" DATETIME,
    "durationSec" INTEGER,
    "transcript" TEXT,
    CONSTRAINT "Call_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  // Web Push subscriptions from the phone PWA.
  `CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
]

const INDEX_DDL = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_accessToken_key" ON "User"("accessToken")`,
  `CREATE INDEX IF NOT EXISTS "Call_userId_createdAt_idx" ON "Call"("userId", "createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint")`,
]

// Columns added to prisma/schema.prisma AFTER a table already exists in an
// older database (e.g. the current Turso prod DB predates the AI-brain
// fields). Applied one by one; "duplicate column" errors are expected.
const EXTRA_COLUMNS: Array<{ table: string; name: string; type: string }> = [
  { table: 'User', name: 'fishApiKey', type: 'TEXT' },
  { table: 'User', name: 'fishVoiceId', type: 'TEXT' },
  { table: 'User', name: 'llmApiKey', type: 'TEXT' },
  { table: 'User', name: 'llmBaseUrl', type: 'TEXT' },
  { table: 'User', name: 'llmModel', type: 'TEXT' },
]

async function applySchema(): Promise<boolean> {
  try {
    for (const ddl of TABLE_DDL) await db.$executeRawUnsafe(ddl)
    for (const ddl of INDEX_DDL) await db.$executeRawUnsafe(ddl)
  } catch (err) {
    console.error('[db] schema bootstrap failed:', err)
    return false
  }

  for (const col of EXTRA_COLUMNS) {
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "${col.table}" ADD COLUMN "${col.name}" ${col.type}`)
      console.log(`[db] added missing column ${col.table}.${col.name}`)
    } catch (err) {
      const msg = String(err)
      if (/duplicate column|already exists/i.test(msg)) continue // normal on every boot after the first
      console.warn(`[db] could not add ${col.table}.${col.name}:`, msg.slice(0, 200))
    }
  }
  return true
}

/**
 * Make sure the runtime database matches prisma/schema.prisma before any
 * query runs. Memoized per lambda; a failed attempt is NOT memoized so the
 * next request retries (e.g. after a transient Turso hiccup).
 */
export function ensureDbReady(): Promise<boolean> {
  if (!globalForPrisma.nidaaSchemaReady) {
    const p = applySchema().then((ok) => {
      if (!ok) globalForPrisma.nidaaSchemaReady = undefined // allow retry
      return ok
    })
    globalForPrisma.nidaaSchemaReady = p
  }
  return globalForPrisma.nidaaSchemaReady
}
