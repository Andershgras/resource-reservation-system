import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSession,
  expireSession,
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

const user = { id: 1, name: 'User', email: 'user@example.com', role: 'User' as const }

function session(expiresInSeconds = 60) {
  return {
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    expiresInSeconds,
    user,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('authSession', () => {
  it('keeps the session in memory and stores only a hint, never a token', () => {
    startSession(session())

    expect(getSessionUser()).toEqual(user)
    expect(isSignedIn()).toBe(true)
    expect(Object.keys(localStorage)).toEqual(['resource-reservation-signed-in'])
    expect(hadSession()).toBe(true)
  })

  it('times the session from expiresInSeconds on this device clock', () => {
    vi.useFakeTimers({ now: new Date('2030-01-01T12:00:00Z') })

    // The server's expiresAt is two hours off, as if the clocks disagreed.
    startSession({ ...session(), expiresAt: '2030-01-01T14:00:00Z', expiresInSeconds: 60 })

    expect(getSessionExpiresAt()).toBe(Date.parse('2030-01-01T12:01:00Z'))
  })

  it('falls back to expiresAt when expiresInSeconds is missing', () => {
    vi.useFakeTimers({ now: new Date('2030-01-01T12:00:00Z') })

    startSession({ ...session(), expiresAt: '2030-01-01T12:05:00Z', expiresInSeconds: Number.NaN })

    expect(getSessionExpiresAt()).toBe(Date.parse('2030-01-01T12:05:00Z'))
  })

  it('forgets the session and the hint on sign-out, without notifying', () => {
    const listener = vi.fn()
    onSessionExpired(listener)
    startSession(session())

    clearSession()

    expect(getSessionUser()).toBeNull()
    expect(hadSession()).toBe(false)
    expect(listener).not.toHaveBeenCalled()
  })

  it('ends the session of the given generation and notifies the listeners', () => {
    const listener = vi.fn()
    onSessionExpired(listener)
    startSession(session())

    expireSession(getSessionGeneration())

    expect(isSignedIn()).toBe(false)
    expect(hadSession()).toBe(false)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('leaves a newer session alone', () => {
    const listener = vi.fn()
    onSessionExpired(listener)
    startSession(session())
    const olderGeneration = getSessionGeneration()
    startSession(session())

    expireSession(olderGeneration)

    expect(isSignedIn()).toBe(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifying a listener after it unsubscribes', () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    startSession(session())

    unsubscribe()
    expireSession(getSessionGeneration())

    expect(listener).not.toHaveBeenCalled()
  })

  it('does nothing before the session expires', () => {
    vi.useFakeTimers()
    startSession(session(60))

    vi.advanceTimersByTime(59_000)
    expireSessionIfDue()

    expect(isSignedIn()).toBe(true)
  })

  it('ends the session once it has expired', () => {
    vi.useFakeTimers()
    const listener = vi.fn()
    onSessionExpired(listener)
    startSession(session(60))

    vi.advanceTimersByTime(60_000)
    expireSessionIfDue()

    expect(isSignedIn()).toBe(false)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('removes the token stored by earlier versions', () => {
    localStorage.setItem('resource-reservation-auth-token', 'old-token')
    localStorage.setItem('resource-reservation-auth-user', '{}')
    localStorage.setItem('resource-reservation-auth-expires-at', '1')
    localStorage.setItem('rr-theme', 'dark')

    removeLegacyStorage()

    expect(Object.keys(localStorage)).toEqual(['rr-theme'])
  })

  it('remembers a sign-out that has not reached the server', () => {
    markPendingLogout(true)
    expect(hasPendingLogout()).toBe(true)

    markPendingLogout(false)
    expect(hasPendingLogout()).toBe(false)
  })
})
