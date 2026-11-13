import { NextRequest, NextResponse } from 'next/server'
import { getUserByToken } from '@/lib/auth'
import { getInternalSecret } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/**
 * Internal: lets the socket.io mini-service validate a client token and find
 * which user's rooms it may join. Protected by the shared internal secret.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== getInternalSecret()) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = (await req.json()) as { token?: string }
    const user = await getUserByToken(body.token || '')
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 })
    }
    return NextResponse.json({ ok: true, userId: user.id, username: user.username })
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 })
  }
}
