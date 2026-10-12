import { createContext, useContext } from 'react'
import type { LoginUserRequest, UserResponse } from '../api/types'

// Why the last session ended, shown on the login screen.
export type SessionEnd = 'expired' | 'loggedOut' | null

export interface AuthContextValue {
  currentUser: UserResponse | null
  sessionEnd: SessionEnd
  logIn: (credentials: LoginUserRequest) => Promise<UserResponse>
  logOut: () => void
  clearSessionEnd: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.')
  }

  return value
}

// For screens that RequireAuth only shows to a logged-in user.
export function useCurrentUser(): UserResponse {
  const { currentUser } = useAuth()

  if (!currentUser) {
    throw new Error('useCurrentUser must be used inside RequireAuth.')
  }

  return currentUser
}
