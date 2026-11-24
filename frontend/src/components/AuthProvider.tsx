import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { authApi } from '../api/auth'
import { getSession, setSession, subscribeSession } from '../api/session'
import { AuthContext, type AuthState } from '../lib/authContext'
import { isManager } from '../lib/permissions'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribeSession, getSession)
  const token = session?.token

  // On load, confirm the stored token still belongs to an existing account with the same role.
  // A 401 clears the session by itself (api/client.ts); a role change needs a fresh token.
  useEffect(() => {
    if (!token) return
    const stored = getSession()?.user.role
    authApi
      .me()
      .then((me) => {
        if (me.role !== stored) setSession(null)
      })
      .catch(() => undefined) // offline etc.: keep the session, individual calls report their own errors
  }, [token])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password)
    setSession({ token: result.token, expiresAt: result.expiresAt, user: result.user })
  }, [])
  const logout = useCallback(() => setSession(null), [])

  const value = useMemo<AuthState>(
    () => ({ user: session?.user ?? null, isManager: isManager(session?.user ?? null), login, logout }),
    [session, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
