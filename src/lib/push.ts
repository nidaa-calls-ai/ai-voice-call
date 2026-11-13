import { db } from '@/lib/db'
import { getVapidKeys } from '@/lib/settings'

export type PushPayload = {
  callId?: string
  title: string
  body: string
  url?: string
  urgency?: string
}

/** Send a Web Push notification to ONE user's saved devices. Drops dead endpoints. */
export async function sendPushToUser(userId: string | null | undefined, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!userId) return { sent: 0, failed: 0 }
  const subs = await db.pushSubscription.findMany({ where: { userId } })
  if (subs.length === 0) return { sent: 0, failed: 0 }

  const webpush = await import('web-push')
  const { publicKey, privateKey } = await getVapidKeys()
  webpush.setVapidDetails('mailto:nidaa-mcp@example.com', publicKey, privateKey)

  let sent = 0
  let failed = 0
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 120, urgency: payload.urgency === 'high' ? 'high' : 'normal' }
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode
        // 404 / 410 => subscription expired, remove it
        if (status === 404 || status === 410) {
          try {
            await db.pushSubscription.delete({ where: { id: sub.id } })
          } catch {
            /* ignore */
          }
        }
        failed++
      }
    })
  )
  return { sent, failed }
}
