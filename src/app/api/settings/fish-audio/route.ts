import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { FISH_TTS_MODEL, maskApiKey, userFishConfig } from '@/lib/settings'
import { authenticate } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * fish.audio voice credentials — PER ACCOUNT (each user speaks with their own key/voice).
 * GET  -> masked key + current voice id (never returns the raw key)
 * POST -> save { api_key?, voice_id? } to the signed-in user's record
 */
export async function GET(req: NextRequest) {
  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams })
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const row = await db.user.findUnique({ where: { id: user.id }, select: { fishApiKey: true, fishVoiceId: true } })
  const cfg = userFishConfig(row ?? { fishApiKey: null, fishVoiceId: null })
  return NextResponse.json({
    ok: true,
    configured: !!cfg.apiKey,
    apiKeyMasked: cfg.apiKey ? maskApiKey(cfg.apiKey) : null,
    voiceId: cfg.voiceId,
    model: FISH_TTS_MODEL,
  })
}

export async function POST(req: NextRequest) {
  try {
    let body: { api_key?: string; voice_id?: string; token?: string } = {}
    try {
      body = (await req.json()) as typeof body
    } catch {
      /* handled below */
    }
    const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams }, body.token)
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = (body.api_key || '').trim()
    const voiceId = (body.voice_id || '').trim()
    if (apiKey && !apiKey.startsWith('sk-fish-')) {
      return NextResponse.json({ ok: false, error: 'مفتاح fish.audio لازم يبدأ بـ sk-fish-' }, { status: 400 })
    }
    if (!apiKey && !voiceId) {
      return NextResponse.json({ ok: false, error: 'مفيش حاجة للتسجيل' }, { status: 400 })
    }

    const row = await db.user.findUnique({ where: { id: user.id }, select: { fishApiKey: true, fishVoiceId: true } })
    const data: { fishApiKey?: string; fishVoiceId?: string } = {}
    if (apiKey) data.fishApiKey = apiKey
    if (voiceId || !row?.fishVoiceId) data.fishVoiceId = voiceId || undefined
    await db.user.update({ where: { id: user.id }, data })

    const fresh = await db.user.findUnique({ where: { id: user.id }, select: { fishApiKey: true, fishVoiceId: true } })
    const cfg = userFishConfig(fresh ?? { fishApiKey: null, fishVoiceId: null })
    return NextResponse.json({
      ok: true,
      configured: !!cfg.apiKey,
      apiKeyMasked: cfg.apiKey ? maskApiKey(cfg.apiKey) : null,
      voiceId: cfg.voiceId,
    })
  } catch (err) {
    console.error('[settings/fish-audio] error:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
