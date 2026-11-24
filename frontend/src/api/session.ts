import type { User } from '../types'

/** The signed-in session. Kept in sessionStorage: it survives a reload but not closing the tab. */
export interface Session {
  token: string
  /** Unix seconds. */
  expiresAt: number
  user: User
}

const KEY = 'gamevault.session'
const listeners = new Set<() => void>()
let cache: Session | null | undefined // undefined = not read from storage yet

function read(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed.token || !parsed.user || parsed.expiresAt * 1000 <= Date.now()) {
      sessionStorage.removeItem(KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Stable between changes, so it can be a useSyncExternalStore snapshot. */
export function getSession(): Session | null {
  if (cache === undefined) cache = read()
  if (cache && cache.expiresAt * 1000 <= Date.now()) setSession(null)
  return cache ?? null
}

export function getToken(): string | null {
  return getSession()?.token ?? null
}

export function setSession(session: Session | null): void {
  cache = session
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: the session then lives in memory only */
  }
  listeners.forEach((fn) => fn())
}

export function subscribeSession(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
