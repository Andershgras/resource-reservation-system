import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onSessionExpired, saveAuthSession } from '../auth/authStorage'
import { ApiError, apiRequest } from './client'

const fetchMock = vi.fn<typeof fetch>()

function problem(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify({ status, ...body }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

function logIn(token = 'token-1') {
  saveAuthSession({
    token,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    expiresInSeconds: 60,
    user: { id: 1, name: 'User', email: 'user@example.com', role: 'User' },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

describe('apiRequest', () => {
  it('sends JSON and the bearer token', async () => {
    logIn()
    fetchMock.mockResolvedValue(Response.json({ id: 1 }))

    const result = await apiRequest('/resources', { method: 'POST', body: { name: 'Room' } })

    expect(result).toEqual({ id: 1 })
    const [url, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(url).toBe('http://localhost:5052/api/resources')
    expect(headers.get('Authorization')).toBe('Bearer token-1')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init?.body).toBe('{"name":"Room"}')
  })

  it('sends no token when logged out', async () => {
    fetchMock.mockResolvedValue(Response.json([]))

    await apiRequest('/resources')

    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(false)
  })

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(apiRequest('/resources/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('uses the problem detail as the error message', async () => {
    fetchMock.mockResolvedValue(problem(409, {
      title: 'Conflict',
      detail: 'Resource is already reserved in this time period.',
    }))

    const error = await apiRequest('/reservations').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      message: 'Resource is already reserved in this time period.',
    })
  })

  it('joins validation messages from every field', async () => {
    fetchMock.mockResolvedValue(problem(400, {
      title: 'One or more validation errors occurred.',
      errors: { Email: ['Email is required.'], Password: ['Password is too short.'] },
    }))

    await expect(apiRequest('/auth/register')).rejects.toThrow(
      'Email is required. Password is too short.',
    )
  })

  it('falls back to the title, then to the status', async () => {
    fetchMock.mockResolvedValueOnce(problem(404, { title: 'Not Found' }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))

    await expect(apiRequest('/resources/9')).rejects.toThrow('Not Found')
    await expect(apiRequest('/resources/9')).rejects.toThrow('Request failed with status 502')
  })

  it('ends the session on a 401 for a request that sent a token', async () => {
    logIn()
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    fetchMock.mockResolvedValue(problem(401, { detail: 'Authentication is required.' }))

    await expect(apiRequest('/reservations/me')).rejects.toThrow('Authentication is required.')

    expect(listener).toHaveBeenCalledOnce()
    expect(localStorage.length).toBe(0)
    unsubscribe()
  })

  it('treats a 401 without a token, such as a failed login, as an ordinary error', async () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    fetchMock.mockResolvedValue(problem(401, { detail: 'Invalid email or password.' }))

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} }))
      .rejects.toThrow('Invalid email or password.')

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})
