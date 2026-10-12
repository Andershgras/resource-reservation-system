import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse } from '../api/types'
import {
  expireAuthSession,
  expireAuthSessionIfDue,
  getAuthToken,
  getSessionExpiresAt,
  onSessionExpired,
  restoreAuthSession,
  saveAuthSession,
} from './authStorage'

const now = new Date('2030-01-15T09:00:00Z').getTime()

const user = { id: 2, name: 'Test User', email: 'user@example.com', role: 'User' as const }

function authResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    token: 'token-1',
    expiresAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    expiresInSeconds: 2 * 60 * 60,
    user,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('saveAuthSession', () => {
  it('times the session from expiresInSeconds on this device clock', () => {
    // The server says the token expires at a time this device considers long
    // past, but the lifetime is what counts.
    saveAuthSession(authResponse({ expiresAt: '2000-01-01T00:00:00Z' }))

    expect(getSessionExpiresAt()).toBe(now + 2 * 60 * 60 * 1000)
  })

  it('falls back to expiresAt when expiresInSeconds is missing', () => {
    saveAuthSession(authResponse({ expiresInSeconds: undefined as unknown as number }))

    expect(getSessionExpiresAt()).toBe(now + 2 * 60 * 60 * 1000)
  })
})

describe('restoreAuthSession', () => {
  it('restores a valid session', () => {
    saveAuthSession(authResponse())

    expect(restoreAuthSession()).toEqual({ user, expired: false })
  })

  it('reports no session when nothing is stored', () => {
    expect(restoreAuthSession()).toEqual({ user: null, expired: false })
  })

  it('discards an expired session', () => {
    saveAuthSession(authResponse())
    vi.setSystemTime(now + 2 * 60 * 60 * 1000)

    expect(restoreAuthSession()).toEqual({ user: null, expired: true })
    expect(localStorage.length).toBe(0)
  })

  it('treats a session saved before expiry times were stored as expired', () => {
    localStorage.setItem('resource-reservation-auth-token', 'old-token')
    localStorage.setItem('resource-reservation-auth-user', JSON.stringify(user))

    expect(restoreAuthSession()).toEqual({ user: null, expired: true })
  })
})

describe('getAuthToken', () => {
  it('returns the token while the session is valid', () => {
    saveAuthSession(authResponse())

    expect(getAuthToken()).toBe('token-1')
  })

  it('ends an expired session and notifies the listeners', () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    saveAuthSession(authResponse())
    vi.setSystemTime(now + 2 * 60 * 60 * 1000 + 1)

    expect(getAuthToken()).toBeNull()
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })
})

describe('expireAuthSession', () => {
  it('ends the session that sent the rejected token', () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    saveAuthSession(authResponse())

    expireAuthSession('token-1')

    expect(getAuthToken()).toBeNull()
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('leaves a newer session alone', () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    saveAuthSession(authResponse({ token: 'token-2' }))

    expireAuthSession('token-1')

    expect(getAuthToken()).toBe('token-2')
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('stops notifying a listener after it unsubscribes', () => {
    const listener = vi.fn()
    onSessionExpired(listener)()
    saveAuthSession(authResponse())

    expireAuthSession('token-1')

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('expireAuthSessionIfDue', () => {
  it('does nothing before the session expires', () => {
    saveAuthSession(authResponse())
    vi.setSystemTime(now + 60 * 60 * 1000)

    expireAuthSessionIfDue()

    expect(getAuthToken()).toBe('token-1')
  })

  it('ends the session once it has expired', () => {
    saveAuthSession(authResponse())
    vi.setSystemTime(now + 2 * 60 * 60 * 1000)

    expireAuthSessionIfDue()

    expect(localStorage.length).toBe(0)
  })
})
