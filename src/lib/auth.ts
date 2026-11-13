import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * Multi-user authentication:
 *  - login: username + password (scrypt-hashed)
 *  - every user owns a personal access token used by the dashboard, the phone PWA,
 *    the MCP endpoint and the REST API. The token IS the user's identity.
 */

export type SafeUser = {
  id: string
  username: string
  displayName: string
  accessToken: string
  fishConfigured: boolean
  fishVoiceId: string | null
}

export function randomToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  try {
    const candidate = crypto.scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

export function sanitizeUsername(raw: string): string | null {
  const username = raw.trim()
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) return null
  return username
}

/** Find the user that owns an access token (null when the token is unknown/revoked). */
export async function getUserByToken(token: string): Promise<SafeUser | null> {
  await ensureDbReady() // keep the runtime DB in sync with prisma/schema.prisma
  const clean = (token || '').trim()
  if (!clean) return null
  const user = await db.user.findUnique({ where: { accessToken: clean } })
  return user ? toSafeUser(user) : null
}

/**
 * Extract the access token from a request:
 * Authorization: Bearer <token>  |  x-api-key  |  ?token=  |  body.token
 */
export function extractAuthToken(req: { headers: { get(name: string): string | null }; query?: { get(name: string): string | null } }, bodyToken?: string): string {
  let token = ''
  const auth = req.headers.get('authorization')
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m) token = m[1].trim()
  }
  if (!token) {
    const xApi = req.headers.get('x-api-key')
    if (xApi) token = xApi.trim()
  }
  if (!token && req.query) token = (req.query.get('token') || '').trim()
  if (!token && bodyToken) token = bodyToken.trim()
  return token
}

/** Authenticate a request -> SafeUser | null. Accepts header/query/body token. */
export async function authenticate(
  req: { headers: { get(name: string): string | null }; query?: { get(name: string): string | null } },
  bodyToken?: string
): Promise<SafeUser | null> {
  return getUserByToken(extractAuthToken(req, bodyToken))
}

export function toSafeUser(user: {
  id: string
  username: string
  displayName: string
  accessToken: string
  fishApiKey: string | null
  fishVoiceId: string | null
}): SafeUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    accessToken: user.accessToken,
    fishConfigured: !!user.fishApiKey,
    fishVoiceId: user.fishVoiceId,
  }
}
