import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { db } from '@/lib/db'
import { maskApiKey } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/** Current account info (token, fish.audio state) — Bearer token required. */
export async function GET(req: NextRequest) {
  const user = await authenticate(req)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // fresh fish config straight from the DB (accessToken from auth is already current)
  const row = await db.user.findUnique({ where: { id: user.id }, select: { fishApiKey: true, fishVoiceId: true } })
  return NextResponse.json({
    ok: true,
    user: {
      ...user,
      fishConfigured: !!row?.fishApiKey,
      fishApiKeyMasked: row?.fishApiKey ? maskApiKey(row.fishApiKey) : null,
      fishVoiceId: row?.fishVoiceId || null,
    },
  })
}
