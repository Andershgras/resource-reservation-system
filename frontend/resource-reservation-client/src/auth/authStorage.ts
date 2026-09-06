import type { AuthResponse, UserResponse } from '../api/types'

const authTokenKey = 'resource-reservation-auth-token'
const authUserKey = 'resource-reservation-auth-user'

export function saveAuthSession(auth: AuthResponse) {
  localStorage.setItem(authTokenKey, auth.token)
  localStorage.setItem(authUserKey, JSON.stringify(auth.user))
}

export function getAuthToken() {
  return localStorage.getItem(authTokenKey)
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

export function clearAuthSession() {
  localStorage.removeItem(authTokenKey)
  localStorage.removeItem(authUserKey)
}

export function isAdmin() {
  return getAuthUser()?.role === 'Admin'
}
