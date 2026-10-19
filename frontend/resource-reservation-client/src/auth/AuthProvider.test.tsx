import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../api/authApi'
import { ApiError } from '../api/client'
import { createQueryClient } from '../app/queryClient'
import { queryKeys } from '../lib/queryKeys'
import { useAuth } from './authContext'
import { AuthProvider } from './AuthProvider'
import {
  expireSession,
  getSessionGeneration,
  hasPendingLogout,
  markPendingLogout,
  startSession,
} from './authSession'

vi.mock('../api/authApi')

const user = { id: 2, name: 'User', email: 'user@example.com', role: 'User' as const }
const unauthorized = new ApiError('Authentication is required.', 401)

function session() {
  return { expiresAt: new Date(Date.now() + 60_000).toISOString(), expiresInSeconds: 60, user }
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

beforeEach(() => {
  vi.mocked(authApi.logout).mockResolvedValue(undefined)
  vi.mocked(authApi.getCurrentSession).mockRejectedValue(unauthorized)
})

describe('AuthProvider', () => {
  it('restores the session from the cookie on load', async () => {
    vi.mocked(authApi.getCurrentSession).mockResolvedValue(session())

    const { result } = renderAuth()

    expect(result.current.isRestoring).toBe(true)
    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    expect(result.current.currentUser).toEqual(user)
    expect(result.current.sessionEnd).toBeNull()
  })

  it('starts signed out when nobody is signed in', async () => {
    const { result } = renderAuth()

    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    expect(result.current.currentUser).toBeNull()
    expect(result.current.sessionEnd).toBeNull()
  })

  it('says the session expired when one was started here but the cookie no longer works', async () => {
    localStorage.setItem('resource-reservation-signed-in', 'true')

    const { result } = renderAuth()

    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    expect(result.current.currentUser).toBeNull()
    expect(result.current.sessionEnd).toBe('expired')
  })

  it('finishes a sign-out that failed before asking who is signed in', async () => {
    markPendingLogout(true)
    vi.mocked(authApi.getCurrentSession).mockResolvedValue(session())

    const { result } = renderAuth()

    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    expect(authApi.logout).toHaveBeenCalledOnce()
    expect(authApi.getCurrentSession).not.toHaveBeenCalled()
    expect(result.current.currentUser).toBeNull()
    expect(hasPendingLogout()).toBe(false)
  })

  it('keeps nobody signed in while a pending sign-out keeps failing', async () => {
    markPendingLogout(true)
    vi.mocked(authApi.logout).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.mocked(authApi.getCurrentSession).mockResolvedValue(session())

    const { result } = renderAuth()

    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    expect(result.current.currentUser).toBeNull()
    expect(hasPendingLogout()).toBe(true)
  })

  it('signs out on the server, clears cached data and records the reason', async () => {
    startSession(session())
    const { queryClient, result } = renderAuth()

    act(() => result.current.logOut())

    expect(authApi.logout).toHaveBeenCalledOnce()
    expect(result.current.currentUser).toBeNull()
    expect(result.current.sessionEnd).toBe('loggedOut')
    expect(queryClient.getQueryData(queryKeys.myReservations)).toBeUndefined()
    await waitFor(() => expect(hasPendingLogout()).toBe(false))
  })

  it('remembers a sign-out that failed, for the next page load', async () => {
    vi.mocked(authApi.logout).mockRejectedValue(new TypeError('Failed to fetch'))
    startSession(session())
    const { result } = renderAuth()

    act(() => result.current.logOut())

    expect(result.current.currentUser).toBeNull()
    await waitFor(() => expect(authApi.logout).toHaveBeenCalled())
    expect(hasPendingLogout()).toBe(true)
  })

  it('clears cached data when the session expires', () => {
    startSession(session())
    const { queryClient, result } = renderAuth()

    act(() => expireSession(getSessionGeneration()))

    expect(result.current.currentUser).toBeNull()
    expect(result.current.sessionEnd).toBe('expired')
    expect(queryClient.getQueryData(queryKeys.myReservations)).toBeUndefined()
  })

  it('starts a new session with an empty cache', async () => {
    vi.mocked(authApi.login).mockResolvedValue(session())
    const { queryClient, result } = renderAuth()
    await waitFor(() => expect(result.current.isRestoring).toBe(false))

    await act(() => result.current.logIn({ email: user.email, password: 'Password1' }))

    expect(result.current.currentUser).toEqual(user)
    expect(result.current.sessionEnd).toBeNull()
    expect(queryClient.getQueryData(queryKeys.myReservations)).toBeUndefined()
  })
})
