import { NextRequest, NextResponse } from 'next/server'
import { getUserCall, updateCallFromEvent, type CallEventType } from '@/lib/calls'
import { authenticate } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const VALID_EVENTS: CallEventType[] = ['answered', 'declined', 'missed', 'ended']

/** GET one call — only if it belongs to the signed-in user. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams })
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const call = await getUserCall(id, user.id)
  if (!call) {
    return NextResponse.json({ ok: false, error: 'Call not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, call })
}

/**
 * REST fallback for call lifecycle updates (used when the realtime socket
 * channel is unavailable, e.g. realtime proxy blocked).
 * PATCH { event: 'answered' | 'declined' | 'ended', durationSec?: number }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams })
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { event?: string; durationSec?: number } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    /* handled below */
  }
  const event = (body.event || '') as CallEventType
  if (!VALID_EVENTS.includes(event)) {
    return NextResponse.json({ ok: false, error: "event must be one of: answered, declined, ended" }, { status: 400 })
  }

  // ownership check before applying the event
  const owned = await getUserCall(id, user.id)
  if (!owned) {
    return NextResponse.json({ ok: false, error: 'Call not found' }, { status: 404 })
  }

  const call = await updateCallFromEvent(id, event, typeof body.durationSec === 'number' ? body.durationSec : undefined)
  if (!call) {
    return NextResponse.json({ ok: false, error: 'Call not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, call })
}
