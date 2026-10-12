import type { AuthResponse, UserResponse } from '../api/types'

const authTokenKey = 'resource-reservation-auth-token'
const authUserKey = 'resource-reservation-auth-user'
const authExpiresAtKey = 'resource-reservation-auth-expires-at'

type SessionExpiredListener = () => void

const sessionExpiredListeners = new Set<SessionExpiredListener>()

export function saveAuthSession(auth: AuthResponse) {
  // The expiry is measured on this device's clock from the token lifetime, so a
  // wrong system clock can't end the session the moment it starts.
  const lifetimeMilliseconds = Number.isFinite(auth.expiresInSeconds)
    ? auth.expiresInSeconds * 1000
    : Date.parse(auth.expiresAt) - Date.now()
  const expiresAt = Date.now() + lifetimeMilliseconds

  localStorage.setItem(authTokenKey, auth.token)
  localStorage.setItem(authUserKey, JSON.stringify(auth.user))
  localStorage.setItem(authExpiresAtKey, String(expiresAt))
}

export interface RestoredAuthSession {
  user: UserResponse | null
  // True when a stored session was found but had expired.
  expired: boolean
}

// Restores the session saved by an earlier visit, if it is still valid. Sessions
// saved before expiry times were stored count as expired.
export function restoreAuthSession(): RestoredAuthSession {
  if (!localStorage.getItem(authTokenKey)) {
    clearAuthSession()
    return { user: null, expired: false }
  }

  if (isSessionExpired()) {
    clearAuthSession()
    return { user: null, expired: true }
  }

  return { user: getAuthUser(), expired: false }
}

// Returns the stored token while the session is valid. A session that has
// expired is ended, which notifies the listeners.
export function getAuthToken() {
  const token = localStorage.getItem(authTokenKey)

  if (!token) {
    return null
  }

  if (isSessionExpired()) {
    expireAuthSession(token)
    return null
  }

  return token
}

export function getAuthUser(): UserResponse | null {
  const storedUser = localStorage.getItem(authUserKey)

  if (!storedUser) {
    return null
  }

  try {
    return JSON.parse(storedUser) as UserResponse
  } catch {
    clearAuthSession()
    return null
  }
}

// Ends the stored session if its time is up. Called by a timer at expiry.
export function expireAuthSessionIfDue() {
  const token = localStorage.getItem(authTokenKey)

  if (token && isSessionExpired()) {
    expireAuthSession(token)
  }
}

function isSessionExpired() {
  const expiresAt = getSessionExpiresAt()

  return expiresAt === null || expiresAt <= Date.now()
}

// Milliseconds since the epoch, or null when there is no valid stored value.
export function getSessionExpiresAt() {
  const expiresAt = Number(localStorage.getItem(authExpiresAtKey))

  return Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null
}

export function clearAuthSession() {
  localStorage.removeItem(authTokenKey)
  localStorage.removeItem(authUserKey)
  localStorage.removeItem(authExpiresAtKey)
}

// Ends the session after the API rejected its token. Only the session that sent
// the token is ended: a late response from an older session must not log out a
// newer one. Listeners run only when a session was actually ended.
export function expireAuthSession(rejectedToken: string) {
  if (localStorage.getItem(authTokenKey) !== rejectedToken) {
    return
  }

  clearAuthSession()
  sessionExpiredListeners.forEach((listener) => listener())
}

export function onSessionExpired(listener: SessionExpiredListener) {
  sessionExpiredListeners.add(listener)

  return () => {
    sessionExpiredListeners.delete(listener)
  }
}

export function isAdmin() {
  return getAuthUser()?.role === 'Admin'
}
