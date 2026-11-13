#!/usr/bin/env node
/**
 * Creates an OLD-schema SQLite database (like the current Turso production DB:
 * it predates the AI-brain llm* columns) and a test user inside it.
 * Used to verify ensureDbReady() self-migrates the schema on boot.
 *
 * Also used with --fresh to create a completely EMPTY database file.
 *
 * Usage: node scripts/make-old-db.mjs /tmp/nidaa-test-old.db
 *        node scripts/make-old-db.mjs --fresh /tmp/nidaa-test-fresh.db
 */
import { DatabaseSync } from 'node:sqlite'

const args = process.argv.slice(2)
const fresh = args.includes('--fresh')
const target = args.find((a) => !a.startsWith('--')) || '/tmp/nidaa-test-old.db'
const { mkdirSync } = await import('fs')
mkdirSync(target.substring(0, target.lastIndexOf('/')), { recursive: true })

const db = new DatabaseSync(target)

// OLD schema (no llmApiKey / llmBaseUrl / llmModel) — exactly what Turso has now
// (skipped with --fresh: the file stays truly empty, the app must build it all)
if (!fresh) {
db.exec(`
CREATE TABLE IF NOT EXISTS "Setting" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "fishApiKey" TEXT,
  "fishVoiceId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_accessToken_key" ON "User"("accessToken");
`)

  // scrypt hash like src/lib/auth.ts (salt:hash, 64-byte key)
  const crypto = await import('crypto')
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync('testpass123', salt, 64).toString('hex')
  db.prepare(
    `INSERT OR IGNORE INTO "User" ("id","username","passwordHash","displayName","accessToken")
     VALUES (?,?,?,?,?)`
  ).run('cuid-olduser-0001', 'testold', `${salt}:${hash}`, 'Old Schema Tester', 'oldtokentest0000000000000000')
  console.log('old-schema user seeded: testold / testpass123 / token oldtokentest0000000000000000')
}

const hasUser = db
  .prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='User'`)
  .get().n > 0
const cols = hasUser ? db.prepare(`PRAGMA table_info("User")`).all().map((c) => c.name) : []
console.log(`db ready at ${target} (${fresh ? 'fresh/empty' : 'old schema'})`)
console.log('User columns BEFORE boot:', cols.join(', ') || '(no User table — truly empty)')
db.close()
