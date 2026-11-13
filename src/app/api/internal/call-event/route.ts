import { NextRequest, NextResponse } from 'next/server'
import { ensureDbReady } from '@/lib/db'
import { updateCallFromEvent, CallEventType } from '@/lib/calls'
import { getInternalSecret } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/**
 * Internal endpoint called by the socket.io mini-service when the phone answers /
 * declines / misses / ends a call. Protected by the shared internal secret.
 */
export async function POST(req: NextRequest) {
  await ensureDbReady() // keep the runtime DB in sync with prisma/schema.prisma
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== getInternalSecret()) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = (await req.json()) as { callId?: string; type?: string; durationSec?: number }
    const callId = (body.callId || '').trim()
    const type = body.type as CallEventType | undefined
    if (!callId || !type || !['answered', 'declined', 'missed', 'ended'].includes(type)) {
      return NextResponse.json({ ok: false, error: 'callId and valid type are required' }, { status: 400 })
    }

    const call = await updateCallFromEvent(callId, type, body.durationSec)
    return NextResponse.json({ ok: true, call })
  } catch (err) {
    console.error('[internal/call-event] error:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
