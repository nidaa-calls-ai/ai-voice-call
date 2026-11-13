import { db } from '@/lib/db'
import { fishTts } from '@/lib/fish-tts'

/**
 * Server-side voice synthesis for live calls, shared by the streaming chat
 * route and the plain /api/call/tts route.
 *
 * Engine order:
 *   1. fish.audio (the CALL OWNER's key — each account speaks with its own voice)
 *   2. z-ai TTS   (built-in fallback, needs no key)
 *
 * Returns { audio, mime, voice } or throws when both engines fail (caller
 * decides the fallback, e.g. browser speechSynthesis on the client).
 */

export type OwnerVoice = { fishApiKey: string | null; fishVoiceId: string | null }

export async function getOwnerVoice(userId: string): Promise<OwnerVoice> {
  const owner = await db.user.findUnique({
    where: { id: userId },
    select: { fishApiKey: true, fishVoiceId: true },
  })
  return { fishApiKey: owner?.fishApiKey ?? null, fishVoiceId: owner?.fishVoiceId ?? null }
}

export type SynthResult = { audio: Buffer; mime: 'audio/mpeg' | 'audio/wav'; voice: 'fish-audio' | 'z-ai' }

export async function synthesizeSentence(text: string, owner: OwnerVoice): Promise<SynthResult> {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) throw new Error('Nothing to synthesize')

  // ---- engine 1: fish.audio with the CALL OWNER's credentials ----
  if (owner.fishApiKey) {
    try {
      const { audio } = await fishTts(clean, {
        apiKey: owner.fishApiKey,
        voiceId: owner.fishVoiceId || undefined,
        latency: 'balanced',
      })
      return { audio, mime: 'audio/mpeg', voice: 'fish-audio' }
    } catch (err) {
      console.error('[call-voice] fish.audio failed, falling back to z-ai:', err)
    }
  }

  // ---- engine 2: z-ai TTS fallback ----
  const ZAI = (await import('z-ai-web-dev-sdk')).default
  const zai = await ZAI.create()
  const response = await zai.audio.tts.create({
    input: clean,
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
  return { audio: Buffer.from(new Uint8Array(arrayBuffer)), mime: 'audio/wav', voice: 'z-ai' }
}
