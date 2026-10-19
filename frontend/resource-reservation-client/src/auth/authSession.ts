import type { SessionResponse, UserResponse } from '../api/types'

// The signed-in session, kept in memory only. The session token itself is in
// an httpOnly cookie that scripts can't read (ADR 0012): on page load the app
// asks GET /api/auth/me who is signed in.
//
// The one thing stored in the browser is a hint that a session was started
// here, so that after a reload the login screen can say the session expired
// rather than show nothing. It isn't a credential.
const signedInHintKey = 'resource-reservation-signed-in'

// Set while a sign-out hasn't reached the server, for example while offline.
// Scripts can't delete the httpOnly cookie, so the next page load signs out
// again before asking who is signed in.
const pendingLogoutKey = 'resource-reservation-pending-logout'

// Kept by versions before ADR 0012. Removed on load and never read.
const legacyStorageKeys = [
  'resource-reservation-auth-token',
  'resource-reservation-auth-user',
  'resource-reservation-auth-expires-at',
]

type SessionExpiredListener = () => void

interface Session {
  user: UserResponse
  // Milliseconds since the epoch, on this device's clock.
  expiresAt: number
}

let session: Session | null = null
// Changes whenever a session starts or ends, so a late response from an older
// session can't end a newer one.
let generation = 0
const sessionExpiredListeners = new Set<SessionExpiredListener>()

export function startSession(response: SessionResponse) {
  // The expiry is measured on this device's clock from the remaining lifetime,
  // so a wrong system clock can't end the session the moment it starts.
  const lifetimeMilliseconds = Number.isFinite(response.expiresInSeconds)
    ? response.expiresInSeconds * 1000
    : Date.parse(response.expiresAt) - Date.now()

  session = { user: response.user, expiresAt: Date.now() + lifetimeMilliseconds }
  generation += 1
  writeHint(true)
}

export function getSessionUser(): UserResponse | null {
  return session?.user ?? null
}

// Milliseconds since the epoch, or null without a session.
export function getSessionExpiresAt() {
  return session?.expiresAt ?? null
}

export function getSessionGeneration() {
  return generation
}

export function isSignedIn() {
  return session !== null
}

// Whether a session was started in this browser and not ended by signing out.
export function hadSession() {
  try {
    return localStorage.getItem(signedInHintKey) === 'true'
  } catch {
    return false
  }
}

// Ends the session after signing out. Nobody is notified.
export function clearSession() {
  session = null
  generation += 1
  writeHint(false)
}

// Ends the session after the API rejected it, or when its time ran out. Only
// the session of the given generation is ended. Listeners run only when a
// session was actually ended.
export function expireSession(sessionGeneration: number) {
  if (session === null || sessionGeneration !== generation) {
    return
  }

  session = null
  generation += 1
  writeHint(false)
  sessionExpiredListeners.forEach((listener) => listener())
}

// Called by a timer at expiry. If the timer fires early, nothing happens.
export function expireSessionIfDue() {
  if (session !== null && session.expiresAt <= Date.now()) {
    expireSession(generation)
  }
}

export function onSessionExpired(listener: SessionExpiredListener) {
  sessionExpiredListeners.add(listener)

  return () => {
    sessionExpiredListeners.delete(listener)
  }
}

export function markPendingLogout(pending: boolean) {
  try {
    if (pending) {
      localStorage.setItem(pendingLogoutKey, 'true')
    } else {
      localStorage.removeItem(pendingLogoutKey)
    }
  } catch {
    // Without storage, a failed sign-out isn't retried after a reload.
  }
}

export function hasPendingLogout() {
  try {
    return localStorage.getItem(pendingLogoutKey) === 'true'
  } catch {
    return false
  }
}

export function removeLegacyStorage() {
  try {
    legacyStorageKeys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Storage may be unavailable, for example in a private window.
  }
}

// For tests, which share this module's state.
export function resetSessionForTests() {
  session = null
  generation = 0
  sessionExpiredListeners.clear()
}

function writeHint(signedIn: boolean) {
  try {
    if (signedIn) {
      localStorage.setItem(signedInHintKey, 'true')
    } else {
      localStorage.removeItem(signedInHintKey)
    }
  } catch {
    // Without storage, an expired session simply isn't announced after a reload.
  }
}
