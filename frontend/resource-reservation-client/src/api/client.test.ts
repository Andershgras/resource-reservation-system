import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionGeneration, isSignedIn, onSessionExpired, startSession } from '../auth/authSession'
import { ApiError, apiRequest, invalidateCsrfToken } from './client'

const fetchMock = vi.fn<typeof fetch>()

function problem(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify({ status, ...body }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

function logIn() {
  startSession({
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    expiresInSeconds: 60,
    user: { id: 1, name: 'User', email: 'user@example.com', role: 'User' },
  })
}

// Answers the anti-forgery token request with csrf-1, csrf-2 and so on, and
// every other request with `respond`.
function routeFetch(respond: (url: string, init?: RequestInit) => Response) {
  let tokens = 0

  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input)

    if (url === '/api/auth/csrf') {
      tokens += 1
      return Response.json({ token: `csrf-${tokens}` })
    }

    return respond(url, init)
  })
}

function requestsTo(url: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === url)
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  invalidateCsrfToken()
})

describe('apiRequest', () => {
  it('sends JSON to the same origin, with an anti-forgery token and no Authorization header', async () => {
    logIn()
    routeFetch(() => Response.json({ id: 1 }))

    const result = await apiRequest('/resources', { method: 'POST', body: { name: 'Room' } })

    expect(result).toEqual({ id: 1 })
    const [url, init] = requestsTo('/api/resources')[0]
    const headers = new Headers(init?.headers)
    expect(url).toBe('/api/resources')
    expect(headers.get('X-CSRF-TOKEN')).toBe('csrf-1')
    expect(headers.has('Authorization')).toBe(false)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init?.body).toBe('{"name":"Room"}')
  })

  it('sends no anti-forgery token with reads', async () => {
    fetchMock.mockResolvedValue(Response.json([]))

    await apiRequest('/resources')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('X-CSRF-TOKEN')).toBe(false)
  })

  it('fetches the token once for parallel requests', async () => {
    routeFetch(() => new Response(null, { status: 204 }))

    await Promise.all([
      apiRequest('/resources/1', { method: 'DELETE' }),
      apiRequest('/resources/2', { method: 'DELETE' }),
      apiRequest('/resources/3', { method: 'DELETE' }),
    ])

    expect(requestsTo('/api/auth/csrf')).toHaveLength(1)
  })

  it('fetches a new token after signing in or out, because it is bound to the user', async () => {
    routeFetch((url) => url === '/api/auth/login'
      ? Response.json({ expiresAt: '', expiresInSeconds: 60, user: {} })
      : new Response(null, { status: 204 }))

    await apiRequest('/auth/login', { method: 'POST', body: {} })
    await apiRequest('/resources/1', { method: 'DELETE' })
    await apiRequest('/auth/logout', { method: 'POST' })
    await apiRequest('/auth/register', { method: 'POST', body: {} })

    const tokens = fetchMock.mock.calls
      .filter(([input]) => String(input) !== '/api/auth/csrf')
      .map(([, init]) => new Headers(init?.headers).get('X-CSRF-TOKEN'))
    expect(tokens).toEqual(['csrf-1', 'csrf-2', 'csrf-2', 'csrf-3'])
  })

  it('retries once with a new token when the API rejects the token', async () => {
    let attempts = 0
    routeFetch(() => {
      attempts += 1
      return attempts === 1
        ? problem(403, { detail: 'Out of date.', code: 'csrf_token_invalid' })
        : Response.json({ id: 1 })
    })

    await expect(apiRequest('/resources', { method: 'POST', body: {} })).resolves.toEqual({ id: 1 })

    const sentTokens = requestsTo('/api/resources').map(([, init]) => new Headers(init?.headers).get('X-CSRF-TOKEN'))
    expect(sentTokens).toEqual(['csrf-1', 'csrf-2'])
  })

  it('gives up after one retry', async () => {
    routeFetch(() => problem(403, { detail: 'Out of date.', code: 'csrf_token_invalid' }))

    const error = await apiRequest('/resources', { method: 'POST', body: {} }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ status: 403, code: 'csrf_token_invalid' })
    expect(requestsTo('/api/resources')).toHaveLength(2)
  })

  it('does not retry other 403s', async () => {
    routeFetch(() => problem(403, { detail: 'You do not have permission to access this resource.' }))

    await expect(apiRequest('/resources', { method: 'POST', body: {} })).rejects.toThrow('You do not have permission')

    expect(requestsTo('/api/resources')).toHaveLength(1)
  })

  it('returns undefined for 204 No Content', async () => {
    routeFetch(() => new Response(null, { status: 204 }))

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

  it('keeps the first message for each field, keyed by its camelCase name', async () => {
    fetchMock.mockResolvedValue(problem(400, {
      title: 'One or more validation errors occurred.',
      errors: {
        Password: ['Enter a password.', 'Password must be at least 8 characters.'],
        ResourceId: ['Select a resource.'],
        '$.startTime': ['The JSON value could not be converted to System.DateTime.'],
      },
    }))

    const error = await apiRequest('/reservations').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).fieldErrors).toEqual({
      password: 'Enter a password.',
      resourceId: 'Select a resource.',
      startTime: 'The JSON value could not be converted to System.DateTime.',
    })
  })

  it('has no field errors for other problems', async () => {
    fetchMock.mockResolvedValue(problem(409, { detail: 'Resource is already reserved in this time period.' }))

    const error = await apiRequest('/reservations').catch((caught: unknown) => caught)

    expect((error as ApiError).fieldErrors).toEqual({})
  })

  it('falls back to the title, then to the status', async () => {
    fetchMock.mockResolvedValueOnce(problem(404, { title: 'Not Found' }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))

    await expect(apiRequest('/resources/9')).rejects.toThrow('Not Found')
    await expect(apiRequest('/resources/9')).rejects.toThrow('Request failed with status 502')
  })

  it('ends the session on a 401 for a request made while signed in', async () => {
    logIn()
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    fetchMock.mockResolvedValue(problem(401, { detail: 'Authentication is required.' }))

    await expect(apiRequest('/reservations/me')).rejects.toThrow('Authentication is required.')

    expect(listener).toHaveBeenCalledOnce()
    expect(isSignedIn()).toBe(false)
    unsubscribe()
  })

  it('leaves a session started meanwhile alone', async () => {
    logIn()
    let respond: (response: Response) => void = () => undefined
    fetchMock.mockReturnValue(new Promise((resolve) => { respond = resolve }))

    const pending = apiRequest('/reservations/me').catch(() => undefined)
    logIn()
    const newerGeneration = getSessionGeneration()
    respond(problem(401, { detail: 'Authentication is required.' }))
    await pending

    expect(isSignedIn()).toBe(true)
    expect(getSessionGeneration()).toBe(newerGeneration)
  })

  it('treats a 401 while signed out, such as a failed login, as an ordinary error', async () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    routeFetch(() => problem(401, { detail: 'Invalid email or password.' }))

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} }))
      .rejects.toThrow('Invalid email or password.')

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})
