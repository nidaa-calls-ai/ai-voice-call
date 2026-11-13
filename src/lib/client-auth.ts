'use client'

/**
 * Client-side account session: username + personal access token kept in localStorage.
 * The token IS the user's identity for the dashboard, the phone PWA, MCP and REST.
 */

export type AuthSession = {
  token: string
  userId: string
  username: string
  displayName: string
}

const STORAGE_KEY = 'nidaa_auth'

export function getAuth(): AuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    if (!parsed?.token || !parsed?.username) return null
    return parsed
  } catch {
    return null
  }
}

export function setAuth(session: AuthSession): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function updateAuthToken(token: string): void {
  const current = getAuth()
  if (current) setAuth({ ...current, token })
}

export function clearAuth(): void {
  window.localStorage.removeItem(STORAGE_KEY)
}

/** Authorization header for authenticated fetches. */
export function authHeaders(session: AuthSession | null): Record<string, string> {
  if (!session?.token) return {}
  return { Authorization: `Bearer ${session.token}` }
}
