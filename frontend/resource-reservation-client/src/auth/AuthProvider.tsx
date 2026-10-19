import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getCurrentSession, login, logout } from '../api/authApi'
import { ApiError } from '../api/client'
import type { LoginUserRequest, UserResponse } from '../api/types'
import { AuthContext, type AuthContextValue, type SessionEnd } from './authContext'
import {
  clearSession,
  expireSessionIfDue,
  getSessionExpiresAt,
  getSessionGeneration,
  getSessionUser,
  hadSession,
  hasPendingLogout,
  isSignedIn,
  markPendingLogout,
  onSessionExpired,
  removeLegacyStorage,
  startSession,
} from './authSession'

// setTimeout can't wait longer than about 24 days.
const maxTimeoutMilliseconds = 2_147_483_647

// Holds the signed-in user (see authSession.ts and ADR 0012). On load it asks
// the API who is signed in, from the httpOnly session cookie, and the route
// guards wait until it knows. It ends the session when its time runs out or
// the API rejects it. Cached server data is cleared whenever a session starts
// or ends, so one user never sees another user's data.
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // A session already in memory, as tests set up, needs no restoring.
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(getSessionUser)
  const [isRestoring, setIsRestoring] = useState(() => !isSignedIn())
  const [sessionEnd, setSessionEnd] = useState<SessionEnd>(null)

  useEffect(() => {
    removeLegacyStorage()

    if (isSignedIn()) {
      return
    }

    let cancelled = false
    const generation = getSessionGeneration()

    restoreSession()
      .then((session) => {
        // A sign-in meanwhile wins.
        if (cancelled || getSessionGeneration() !== generation) {
          return
        }

        if (session) {
          startSession(session)
          setCurrentUser(session.user)
        } else if (hadSession()) {
          clearSession()
          setSessionEnd('expired')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRestoring(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  // This only reacts to a session that actually ended, so the login screen,
  // which makes no authenticated requests, never triggers it again.
  useEffect(() => {
    return onSessionExpired(() => {
      queryClient.clear()
      setCurrentUser(null)
      setSessionEnd('expired')
    })
  }, [queryClient])

  useEffect(() => {
    const expiresAt = getSessionExpiresAt()

    if (!currentUser || expiresAt === null) {
      return
    }

    // If the timer fires early, the check finds the session still valid and
    // does nothing.
    const timeoutId = window.setTimeout(
      expireSessionIfDue,
      Math.min(Math.max(expiresAt - Date.now(), 0), maxTimeoutMilliseconds),
    )

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentUser])

  const logIn = useCallback(async (credentials: LoginUserRequest) => {
    const session = await login(credentials)

    startSession(session)
    queryClient.clear()
    setSessionEnd(null)
    setCurrentUser(session.user)
    setIsRestoring(false)

    return session.user
  }, [queryClient])

  // Signed out at once in the app. The request revokes the session on the
  // server and deletes the cookie. If it fails, the next page load tries again.
  const logOut = useCallback(() => {
    markPendingLogout(true)
    void logout().then(() => markPendingLogout(false), () => undefined)

    clearSession()
    queryClient.clear()
    setSessionEnd('loggedOut')
    setCurrentUser(null)
  }, [queryClient])

  const clearSessionEnd = useCallback(() => setSessionEnd(null), [])

  const value = useMemo<AuthContextValue>(
    () => ({ currentUser, isRestoring, sessionEnd, logIn, logOut, clearSessionEnd }),
    [currentUser, isRestoring, sessionEnd, logIn, logOut, clearSessionEnd],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

// The session from the cookie, or null when nobody is signed in. A sign-out
// that didn't reach the server is finished first, and until it does, nobody
// counts as signed in. Any error other than a 401 also counts as signed out.
async function restoreSession() {
  if (hasPendingLogout()) {
    try {
      await logout()
      markPendingLogout(false)
    } catch {
      // Still pending. Try again on the next load.
    }

    return null
  }

  try {
    return await getCurrentSession()
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.warn('Could not restore the session.', error)
    }

    return null
  }
}
