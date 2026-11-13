import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { authenticate } from '@/lib/auth'
import { userFishConfig } from '@/lib/settings'
import { fishTts } from '@/lib/fish-tts'

export const dynamic = 'force-dynamic'

/**
 * Live voice check: generates a tiny MP3 sample with the account's fish.audio
 * credentials (body values override the saved ones, exactly like the save
 * endpoint) and returns it base64-encoded so the dashboard can play it.
 * `testFish()` on the dashboard calls this endpoint.
 */
export async function POST(req: NextRequest) {
  await ensureDbReady()

  let body: { api_key?: string; voice_id?: string; token?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    /* body optional */
  }
  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams }, body.token)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { fishApiKey: true, fishVoiceId: true },
  })
  const saved = userFishConfig(row ?? { fishApiKey: null, fishVoiceId: null })
  const apiKey = (body.api_key || '').trim() || saved.apiKey || ''
  const voiceId = (body.voice_id || '').trim() || saved.voiceId || undefined

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'مفيش مفتاح fish.audio محفوظ — اكتب المفتاح الأول واعمل حفظ' },
      { status: 400 }
    )
  }

  const t0 = Date.now()
  try {
    const out = await fishTts('أهلاً! أنا مساعد نداء، وصوتي شغال تمام الحمد لله.', {
      apiKey,
      voiceId,
      latency: 'balanced',
    })
    return NextResponse.json({
      ok: true,
      ms: Date.now() - t0,
      audio: out.audio.toString('base64'),
      mime: out.mime,
    })
  } catch (err) {
    const ms = Date.now() - t0
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, ms, error: msg.slice(0, 300) })
  }
}
