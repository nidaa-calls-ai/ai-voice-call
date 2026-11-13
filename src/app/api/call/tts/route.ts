import { NextRequest, NextResponse } from 'next/server'
import { getUserCall } from '@/lib/calls'
import { authenticate } from '@/lib/auth'
import { getOwnerVoice, synthesizeSentence } from '@/lib/call-voice'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Server-side AI voice for the live call (guaranteed Arabic speech in any browser,
 * no dependency on the device's installed TTS voices).
 *
 * Engine order (in src/lib/call-voice.ts):
 *   1. fish.audio (the CALL OWNER's key — each account speaks with its own voice)
 *   2. z-ai TTS   (built-in fallback, needs no key)
 *   3. client falls back to browser speechSynthesis when ok=false
 *
 * POST { callId, text }  ->  { ok, voice, mime, audio: [<base64>, ...] }
 * Auth: the signed-in user's personal access token; the call must belong to them.
 */

const MAX_TEXT = 1000
const MAX_CHUNKS = 3

function splitForTts(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= MAX_TEXT) return [clean]
  // split by sentence boundaries into <= MAX_TEXT chunks
  const parts = clean.match(/[^.!?؟]+[.!?؟]*/g) || [clean]
  const chunks: string[] = []
  let buf = ''
  for (const p of parts) {
    if ((buf + p).length <= MAX_TEXT) buf += p
    else {
      if (buf.trim()) chunks.push(buf.trim())
      buf = p
    }
    if (chunks.length >= MAX_CHUNKS) break
  }
  if (buf.trim() && chunks.length < MAX_CHUNKS) chunks.push(buf.trim())
  return chunks.slice(0, MAX_CHUNKS)
}

export async function POST(req: NextRequest) {
  let body: { callId?: string; text?: string; token?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    /* handled below */
  }

  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams }, body.token)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized: invalid or missing token' }, { status: 401 })
  }

  const text = (body.text || '').trim()
  const callId = (body.callId || '').trim()
  if (!text) {
    return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 })
  }
  if (text.length > MAX_TEXT * MAX_CHUNKS + 200) {
    return NextResponse.json({ ok: false, error: 'Text too long' }, { status: 400 })
  }
  // call must exist AND belong to this user
  if (!callId || !(await getUserCall(callId, user.id))) {
    return NextResponse.json({ ok: false, error: 'Call not found' }, { status: 404 })
  }

  const chunks = splitForTts(text)
  const owner = await getOwnerVoice(user.id)

  try {
    const audio: string[] = []
    let voice = 'fish-audio'
    let mime: 'audio/mpeg' | 'audio/wav' = 'audio/mpeg'
    for (const chunk of chunks) {
      const synth = await synthesizeSentence(chunk, owner)
      voice = synth.voice
      mime = synth.mime
      audio.push(synth.audio.toString('base64'))
    }
    return NextResponse.json(
      { ok: true, voice, mime, audio },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('[call/tts] error:', err)
    // client falls back to browser speechSynthesis when ok=false
    return NextResponse.json({ ok: false, error: 'TTS unavailable', audio: [] }, { status: 502 })
  }
}
