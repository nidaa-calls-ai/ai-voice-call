import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { isPhoneActive } from '@/lib/presence'
import { getSocketStatus } from '@/lib/calls'

export const dynamic = 'force-dynamic'

/**
 * Phone online status for the dashboard: a live socket connection (local setup)
 * OR a fresh heartbeat (works on Vercel serverless too).
 */
export async function GET(req: NextRequest) {
  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams })
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const [socket, active] = await Promise.all([getSocketStatus(user.id), isPhoneActive(user.id)])
  return NextResponse.json({ ok: true, online: active || socket.phoneOnline > 0, live: socket.phoneOnline })
}
