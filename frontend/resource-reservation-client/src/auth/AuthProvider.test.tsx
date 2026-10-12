import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import * as authApi from '../api/authApi'
import { createQueryClient } from '../app/queryClient'
import { queryKeys } from '../lib/queryKeys'
import { useAuth } from './authContext'
import { AuthProvider } from './AuthProvider'
import { expireAuthSession, saveAuthSession } from './authStorage'

vi.mock('../api/authApi')

const user = { id: 2, name: 'User', email: 'user@example.com', role: 'User' as const }

function session(token: string) {
  return { token, expiresAt: new Date(Date.now() + 60_000).toISOString(), expiresInSeconds: 60, user }
}

function renderAuth() {
  const queryClient = createQueryClient()
  queryClient.setQueryData(queryKeys.myReservations, [{ id: 1 }])

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    )
  }

  return { queryClient, ...renderHook(() => useAuth(), { wrapper }) }
}

describe('AuthProvider', () => {
  it('restores a stored session', () => {
    saveAuthSession(session('token-1'))

    const { result } = renderAuth()

    expect(result.current.currentUser).toEqual(user)
  })

  it('clears cached data and records the reason on logout', () => {
    saveAuthSession(session('token-1'))
    const { queryClient, result } = renderAuth()

    act(() => result.current.logOut())

    expect(result.current.currentUser).toBeNull()
    expect(result.current.sessionEnd).toBe('loggedOut')
    expect(queryClient.getQueryData(queryKeys.myReservations)).toBeUndefined()
  })

  it('clears cached data when the session expires', () => {
    saveAuthSession(session('token-1'))
    const { queryClient, result } = renderAuth()

    act(() => expireAuthSession('token-1'))

    expect(result.current.currentUser).toBeNull()
    expect(result.current.sessionEnd).toBe('expired')
    expect(queryClient.getQueryData(queryKeys.myReservations)).toBeUndefined()
  })

  it('starts a new session with an empty cache', async () => {
    vi.mocked(authApi.login).mockResolvedValue(session('token-2'))
    const { queryClient, result } = renderAuth()

    await act(() => result.current.logIn({ email: user.email, password: 'Password1' }))

    expect(result.current.currentUser).toEqual(user)
    expect(result.current.sessionEnd).toBeNull()
    expect(queryClient.getQueryData(queryKeys.myReservations)).toBeUndefined()
  })
})
