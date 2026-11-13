import { NextResponse } from 'next/server'
import { getVapidKeys } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/**
 * Public app config: VAPID public key (push subscription needs it) + socket port.
 * NOTE: the access token is NO longer here — every user authenticates with their
 * own personal token (login/register), nothing global to leak.
 */
export async function GET() {
  const vapid = await getVapidKeys()
  return NextResponse.json({
    vapidPublicKey: vapid.publicKey,
    socketPort: 3003,
  })
}
