import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserCall } from '@/lib/calls'
import { authenticate } from '@/lib/auth'
import { fishTts } from '@/lib/fish-tts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Server-side AI voice for the live call (guaranteed Arabic speech in any browser,
 * no dependency on the device's installed TTS voices).
 *
 * Engine order:
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

  // ---- engine 1: fish.audio with the CALL OWNER's credentials ----
  const owner = await db.user.findUnique({
    where: { id: user.id },
    select: { fishApiKey: true, fishVoiceId: true },
  })
  if (owner?.fishApiKey) {
    try {
      const audio: string[] = []
      for (const chunk of chunks) {
        const { audio: buf } = await fishTts(chunk, {
          apiKey: owner.fishApiKey,
          voiceId: owner.fishVoiceId || undefined,
          latency: 'balanced',
        })
        audio.push(buf.toString('base64'))
      }
      return NextResponse.json(
        { ok: true, voice: 'fish-audio', mime: 'audio/mpeg', audio },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    } catch (fishErr) {
      console.error('[call/tts] fish.audio failed, falling back to z-ai:', fishErr)
    }
  }

  // ---- engine 2: z-ai TTS fallback ----
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const audio: string[] = []
    for (const chunk of chunks) {
      const response = await zai.audio.tts.create({
        input: chunk,
        voice: 'tongtong',
        speed: 1.0,
        response_format: 'wav',
        stream: false,
      })
      const arrayBuffer = await response.arrayBuffer()
      const size = arrayBuffer.byteLength
      if (!size) throw new Error('Empty TTS audio')
      // minimal sanity check: WAV files start with "RIFF"
      const head = Buffer.from(new Uint8Array(arrayBuffer.slice(0, 4))).toString('ascii')
      if (head !== 'RIFF') throw new Error('Invalid TTS audio payload')
      audio.push(Buffer.from(new Uint8Array(arrayBuffer)).toString('base64'))
    }
    return NextResponse.json({ ok: true, voice: 'z-ai', mime: 'audio/wav', audio }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[call/tts] error:', err)
    // client falls back to browser speechSynthesis when ok=false
    return NextResponse.json({ ok: false, error: 'TTS unavailable', audio: [] }, { status: 502 })
  }
}
