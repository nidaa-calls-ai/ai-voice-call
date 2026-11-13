import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticate } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Save (or refresh) a Web Push subscription for the SIGNED-IN user's devices only. */
export async function POST(req: NextRequest) {
  try {
    let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; token?: string } = {}
    try {
      body = (await req.json()) as typeof body
    } catch {
      /* handled below */
    }
    const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams }, body.token)
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const endpoint = body?.endpoint
    const p256dh = body?.keys?.p256dh
    const auth = body?.keys?.auth
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ ok: false, error: 'Invalid subscription payload' }, { status: 400 })
    }

    await db.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh, auth, userId: user.id },
      create: { endpoint, p256dh, auth, userId: user.id },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[push/subscribe] error:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
