import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticate, randomToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Regenerate the CURRENT user's access token (invalidates their old one only). */
export async function POST(req: NextRequest) {
  const user = await authenticate(req)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const accessToken = randomToken()
  await db.user.update({ where: { id: user.id }, data: { accessToken } })
  return NextResponse.json({ ok: true, token: accessToken })
}
