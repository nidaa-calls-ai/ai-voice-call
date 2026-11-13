/**
 * Verify the app's exact database stack (PrismaClient + @prisma/adapter-libsql)
 * works against Turso. Mirrors src/lib/db.ts behavior.
 * Usage: TURSO_CONNECTION_URL=... TURSO_AUTH_TOKEN=... node scripts/verify-turso-prisma.mjs
 */
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSQL({
  url: process.env.TURSO_CONNECTION_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})
const db = new PrismaClient({ adapter })

const settings = await db.setting.count()
const calls = await db.call.count()
const users = await db.user.count()

// write/read/delete round-trip (exactly like the app does)
const marker = await db.setting.create({
  data: { key: 'turso_probe', value: new Date().toISOString() },
})
const readBack = await db.setting.findUnique({ where: { key: 'turso_probe' } })
await db.setting.delete({ where: { key: 'turso_probe' } })

console.log(JSON.stringify({
  ok: true,
  provider: adapter.adapterName || 'libsql',
  settings,
  calls,
  users,
  roundTrip: readBack?.key === 'turso_probe',
}, null, 2))

await db.$disconnect()
