import { NextRequest, NextResponse } from 'next/server'
import { listUserCalls, reapStaleRingingCalls } from '@/lib/calls'
import { authenticate } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** The signed-in user's recent calls (dashboard table / phone missed-call list). */
export async function GET(req: NextRequest) {
  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams })
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  await reapStaleRingingCalls(user.id)
  const calls = await listUserCalls(user.id, 50)
  return NextResponse.json({ calls })
}
