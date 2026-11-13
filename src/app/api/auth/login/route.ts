import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sanitizeUsername, toSafeUser, verifyPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Login with username + password -> the user's personal access token. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string; password?: string }
    const username = sanitizeUsername(body.username || '')
    const password = (body.password || '').trim()
    if (!username || !password) {
      return NextResponse.json({ ok: false, error: 'اكتب اسم المستخدم وكلمة السر' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { username } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ ok: false, error: 'اسم المستخدم أو كلمة السر غلط' }, { status: 401 })
    }

    return NextResponse.json({ ok: true, user: toSafeUser(user) })
  } catch (err) {
    console.error('[auth/login] error:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
