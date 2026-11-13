import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { hashPassword, randomToken, sanitizeUsername, toSafeUser } from '@/lib/auth'
import { claimLegacyGlobalFishConfig } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/**
 * Create a new account. Open registration so anyone deploying the app publicly
 * can make their own isolated account (own token, own fish.audio key, own calls).
 * The FIRST registered account claims the legacy global fish.audio key and any
 * pre-multi-user calls/push subscriptions (migration of the personal-app data).
 */
export async function POST(req: NextRequest) {
  await ensureDbReady() // create tables/columns on a fresh database before any insert
  try {
    const body = (await req.json()) as { username?: string; password?: string; display_name?: string }
    const username = sanitizeUsername(body.username || '')
    const password = (body.password || '').trim()
    const displayName = (body.display_name || '').trim() || username || ''

    if (!username) {
      return NextResponse.json(
        { ok: false, error: 'اسم المستخدم لازم يكون من 3 لـ 24 حرف (إنجليزي/أرقام/._- بس)' },
        { status: 400 }
      )
    }
    if (password.length < 6) {
      return NextResponse.json({ ok: false, error: 'كلمة السر لازم تكون 6 حروف على الأقل' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { username } })
    if (existing) {
      return NextResponse.json({ ok: false, error: 'اسم المستخدم ده متسجل قبل كده — اختار اسم تاني' }, { status: 409 })
    }

    const isFirstUser = (await db.user.count()) === 0

    const user = await db.user.create({
      data: {
        username,
        displayName: displayName.slice(0, 40),
        passwordHash: hashPassword(password),
        accessToken: randomToken(),
      },
    })

    // First account = the owner: claim the old global fish.audio credentials + legacy data
    if (isFirstUser) {
      const legacy = await claimLegacyGlobalFishConfig()
      await db.user.update({
        where: { id: user.id },
        data: {
          fishApiKey: legacy.apiKey,
          fishVoiceId: legacy.voiceId,
        },
      })
      await db.call.updateMany({ where: { userId: null }, data: { userId: user.id } })
      await db.pushSubscription.updateMany({ where: { userId: null }, data: { userId: user.id } })
    }

    const fresh = await db.user.findUnique({ where: { id: user.id } })
    return NextResponse.json({ ok: true, user: fresh ? toSafeUser(fresh) : toSafeUser(user) })
  } catch (err) {
    console.error('[auth/register] error:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
