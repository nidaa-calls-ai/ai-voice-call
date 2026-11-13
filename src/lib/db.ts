import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
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
