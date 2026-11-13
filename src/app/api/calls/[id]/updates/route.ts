import { NextRequest, NextResponse } from 'next/server'
import { getUserCall, parseTranscript } from '@/lib/calls'
import { authenticate } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Live transcript + status of one call, for the phone app's polling fallback
 * (used when the realtime socket channel is unavailable).
 * GET /api/calls/<id>/updates?since=<index>
 * -> { ok, status, turns: [{ index, role, text, at }] }  (turns with index >= since)
 * The phone picks role='agent' turns (live updates pushed by GPT/Claude) and
 * announces them out loud mid-call.
 */
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

  const all = parseTranscript(call.transcript)
  const since = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get('since')) || 0))
  const turns = all.filter((t) => t.index >= since)
  return NextResponse.json(
    { ok: true, status: call.status, turns, next_index: all.length },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
