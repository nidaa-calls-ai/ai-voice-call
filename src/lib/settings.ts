import { db } from '@/lib/db'

/**
 * Key-value settings stored in SQLite.
 * Now only holds server-wide config (VAPID keys). User-specific settings
 * (fish.audio credentials, access token) live on the User record.
 */

async function getSetting(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } })
  return row?.value ?? null
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}

export { getSetting, setSetting }

export type VapidKeys = { publicKey: string; privateKey: string }

/** Get (or lazily generate) VAPID keys for Web Push. */
export async function getVapidKeys(): Promise<VapidKeys> {
  let publicKey = await getSetting('vapid_public')
  let privateKey = await getSetting('vapid_private')
  if (!publicKey || !privateKey) {
    // Lazy import so the package is only loaded server-side (CJS module: functions at top level)
    const webpush = await import('web-push')
    const keys = webpush.generateVAPIDKeys()
    publicKey = keys.publicKey
    privateKey = keys.privateKey
    await setSetting('vapid_public', publicKey)
    await setSetting('vapid_private', privateKey)
  }
  return { publicKey, privateKey }
}

/** Shared secret between the Next.js app and the socket.io mini-service. */
export function getInternalSecret(): string {
  return process.env.INTERNAL_SECRET || 'nidaa-internal-secret'
}

// ---------------------------------------------------------------------------
// fish.audio (voice engine used for the assistant's speech during calls)
// ---------------------------------------------------------------------------

export const FISH_TTS_MODEL = 's2.1-pro-free'
export const FISH_TTS_ENDPOINT = 'https://api.fish.audio/v1/tts'
/** Default voice picked by the project owner; users can change it from the dashboard. */
const FISH_DEFAULT_VOICE_ID = '12a85233597842b6a4e169c3db4ec1e0'

export type FishAudioConfig = { apiKey: string | null; voiceId: string | null }

/** Per-user fish.audio credentials stored on the User record. */
export function userFishConfig(user: { fishApiKey: string | null; fishVoiceId: string | null }): FishAudioConfig {
  return {
    apiKey: user.fishApiKey || null,
    voiceId: user.fishVoiceId || FISH_DEFAULT_VOICE_ID,
  }
}

/** Mask an API key for safe display: sk-fish-abc…xyz (first 11 + last 6 chars). */
export function maskApiKey(key: string): string {
  if (key.length <= 20) return `${key.slice(0, 4)}••••••`
  return `${key.slice(0, 11)}${'•'.repeat(8)}${key.slice(-6)}`
}

// ---------------------------------------------------------------------------
// Legacy migration helpers: the pre-multi-user app stored one global fish key
// in the Setting table. The first registered account claims it.
// ---------------------------------------------------------------------------

export async function claimLegacyGlobalFishConfig(): Promise<{ apiKey: string | null; voiceId: string | null }> {
  const apiKey = await getSetting('fish_audio_api_key')
  const voiceId = await getSetting('fish_audio_voice_id')
  if (apiKey) await db.setting.deleteMany({ where: { key: { in: ['fish_audio_api_key', 'fish_audio_voice_id'] } } })
  return { apiKey, voiceId: voiceId || FISH_DEFAULT_VOICE_ID }
}
