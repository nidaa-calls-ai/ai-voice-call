/**
 * One-off migration: push the Prisma schema + local SQLite data to Turso.
 * Usage: TURSO_CONNECTION_URL=... TURSO_AUTH_TOKEN=... node scripts/apply-turso.mjs
 *  (or with bun). Reads /tmp/turso_schema.sql and /tmp/local_data.json.
 */
import { readFileSync } from 'fs'
import { createClient } from '@libsql/client/web'

const url = process.env.TURSO_CONNECTION_URL
const token = process.env.TURSO_AUTH_TOKEN
if (!url || !token) {
  console.error('TURSO_CONNECTION_URL and TURSO_AUTH_TOKEN are required')
  process.exit(1)
}

const db = createClient({ url, authToken: token })
const schema = readFileSync('/tmp/turso_schema.sql', 'utf8')
const data = JSON.parse(readFileSync('/tmp/local_data.json', 'utf8'))

console.log('1) Applying schema...')
await db.executeMultiple(schema)

console.log('2) Inserting settings...')
for (const s of data.settings) {
  await db.execute({
    sql: 'INSERT OR REPLACE INTO "Setting" ("key", "value", "updatedAt") VALUES (?, ?, ?)',
    args: [s.key, s.value, s.updatedAt],
  })
}

console.log('3) Inserting users...')
for (const u of data.users) {
  await db.execute({
    sql: 'INSERT OR IGNORE INTO "User" ("id","username","passwordHash","displayName","accessToken","fishApiKey","fishVoiceId","createdAt") VALUES (?,?,?,?,?,?,?,?)',
    args: [u.id, u.username, u.passwordHash, u.displayName, u.accessToken, u.fishApiKey, u.fishVoiceId, u.createdAt],
  })
}

console.log('4) Inserting calls...')
for (const c of data.calls) {
  await db.execute({
    sql: 'INSERT OR IGNORE INTO "Call" ("id","userId","source","taskName","summary","result","message","urgency","status","createdAt","answeredAt","endedAt","durationSec","transcript") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    args: [c.id, c.userId, c.source, c.taskName, c.summary, c.result, c.message, c.urgency, c.status, c.createdAt, c.answeredAt, c.endedAt, c.durationSec, c.transcript],
  })
}

console.log('5) Inserting push subscriptions...')
for (const p of data.pushSubs) {
  await db.execute({
    sql: 'INSERT OR IGNORE INTO "PushSubscription" ("id","userId","endpoint","p256dh","auth","createdAt") VALUES (?,?,?,?,?,?)',
    args: [p.id, p.userId, p.endpoint, p.p256dh, p.auth, p.createdAt],
  })
}

console.log('6) Verifying...')
for (const t of ['Setting', 'User', 'Call', 'PushSubscription']) {
  const res = await db.execute({ sql: `SELECT COUNT(*) AS n FROM "${t}"`, args: [] })
  console.log(`   ${t}: ${res.rows[0].n}`)
}
const fish = await db.execute({ sql: `SELECT key, value FROM "Setting" WHERE key = 'fish_audio_api_key'`, args: [] })
console.log(`   fish key present: ${fish.rows.length > 0 ? 'yes (' + String(fish.rows[0].value).slice(0, 11) + '...)' : 'NO'}`)
const vapid = await db.execute({ sql: `SELECT COUNT(*) AS n FROM "Setting" WHERE key IN ('vapid_public','vapid_private')`, args: [] })
console.log(`   vapid keys: ${vapid.rows[0].n}`)
console.log('Migration done.')
