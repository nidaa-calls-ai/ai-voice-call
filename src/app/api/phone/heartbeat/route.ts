import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { markPhoneSeen } from '@/lib/presence'

export const dynamic = 'force-dynamic'

/** Phone PWA heartbeat: "the app is open and able to ring right now". */
export async function POST(req: NextRequest) {
  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams })
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  await markPhoneSeen(user.id)
  return NextResponse.json({ ok: true })
}
