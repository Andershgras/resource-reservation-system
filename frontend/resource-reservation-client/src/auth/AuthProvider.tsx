import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { login } from '../api/authApi'
import type { LoginUserRequest, UserResponse } from '../api/types'
import { AuthContext, type AuthContextValue, type SessionEnd } from './authContext'
import {
  clearAuthSession,
  expireAuthSessionIfDue,
  getSessionExpiresAt,
  onSessionExpired,
  restoreAuthSession,
  saveAuthSession,
} from './authStorage'

// setTimeout can't wait longer than about 24 days.
const maxTimeoutMilliseconds = 2_147_483_647

// Holds the logged-in user and ends the session when the token expires or the
// API rejects it (see authStorage.ts and ADR 0004).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [restoredSession] = useState(restoreAuthSession)
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(restoredSession.user)
  const [sessionEnd, setSessionEnd] = useState<SessionEnd>(
    restoredSession.expired ? 'expired' : null,
  )

  // This only reacts to a session that actually ended, so the login screen,
  // which makes no authenticated requests, never triggers it again.
  useEffect(() => {
    return onSessionExpired(() => {
      setCurrentUser(null)
      setSessionEnd('expired')
    })
  }, [])

  useEffect(() => {
    const expiresAt = getSessionExpiresAt()

    if (!currentUser || expiresAt === null) {
      return
    }

    // If the timer fires early, the check finds the session still valid and
    // does nothing.
    const timeoutId = window.setTimeout(
      expireAuthSessionIfDue,
      Math.min(Math.max(expiresAt - Date.now(), 0), maxTimeoutMilliseconds),
    )

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentUser])

  const logIn = useCallback(async (credentials: LoginUserRequest) => {
    const auth = await login(credentials)

    saveAuthSession(auth)
    setSessionEnd(null)
    setCurrentUser(auth.user)

    return auth.user
  }, [])

  const logOut = useCallback(() => {
    clearAuthSession()
    setSessionEnd('loggedOut')
    setCurrentUser(null)
  }, [])

  const clearSessionEnd = useCallback(() => setSessionEnd(null), [])

  const value = useMemo<AuthContextValue>(
    () => ({ currentUser, sessionEnd, logIn, logOut, clearSessionEnd }),
    [currentUser, sessionEnd, logIn, logOut, clearSessionEnd],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
