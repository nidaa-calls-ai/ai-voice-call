/**
 * fish.audio TTS client (https://docs.fish.audio) — the high-quality Arabic voice
 * used by the assistant during calls. Returns MP3 bytes ready to stream to the client.
 * Credentials are passed explicitly (the caller resolves them per user).
 */
import { FISH_TTS_ENDPOINT, FISH_TTS_MODEL } from '@/lib/settings'

export type FishTtsResult = { audio: Buffer; mime: 'audio/mpeg' }

export async function fishTts(
  text: string,
  opts?: { apiKey?: string; voiceId?: string; latency?: 'low' | 'normal' | 'balanced' }
): Promise<FishTtsResult> {
  const apiKey = (opts?.apiKey || '').trim()
  const voiceId = (opts?.voiceId || '').trim()
  if (!apiKey) throw new Error('fish.audio API key is not configured')

  const res = await fetch(FISH_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      model: FISH_TTS_MODEL,
    },
    body: JSON.stringify({
      text,
      reference_id: voiceId || undefined,
      temperature: 0.7,
      top_p: 0.7,
      prosody: { speed: 1, volume: 0, normalize_loudness: true },
      chunk_length: 300,
      normalize: true,
      format: 'mp3',
      sample_rate: 44100,
      mp3_bitrate: 128,
      latency: opts?.latency || 'balanced',
    }),
    signal: AbortSignal.timeout(55000),
  })

  if (!res.ok) {
    let reason = `HTTP ${res.status}`
    try {
      const j = (await res.json()) as { message?: string; reason?: string }
      if (j?.message || j?.reason) reason += `: ${j.message || j.reason}`
    } catch {
      /* non-JSON error body */
    }
    throw new Error(reason)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.byteLength) throw new Error('Empty audio from fish.audio')
  return { audio: buf, mime: 'audio/mpeg' }
}
