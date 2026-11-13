import { db } from '@/lib/db'

/**
 * Phone presence without sockets: the phone PWA posts a heartbeat every 20s
 * while it is open and able to ring. Works everywhere — including Vercel
 * serverless where the socket.io mini-service cannot run.
 */

// The phone pings every 20s; a stamp older than this means the app is closed
// or fully backgrounded (mobile OS freezes JS -> push notifications take over).
const FRESH_MS = 75_000

function stampKey(userId: string): string {
  return `phone:lastSeen:${userId}`
}

/** Record "this user's phone app is open right now". */
export async function markPhoneSeen(userId: string): Promise<void> {
  const key = stampKey(userId)
  const now = new Date().toISOString()
  await db.setting.upsert({
    where: { key },
    update: { value: now },
    create: { key, value: now },
  })
}

/** True when the phone app sent a heartbeat within the freshness window. */
export async function isPhoneActive(userId: string): Promise<boolean> {
  try {
    const row = await db.setting.findUnique({ where: { key: stampKey(userId) } })
    if (!row) return false
    return Date.now() - new Date(row.updatedAt).getTime() < FRESH_MS
  } catch {
    return false
  }
}
