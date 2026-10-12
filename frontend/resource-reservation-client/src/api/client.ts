import { expireAuthSession, getAuthToken } from '../auth/authStorage'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5052/api'

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

// RFC 9457 problem details, as returned by the API for every error.
// Validation errors add `errors`, keyed by field name.
interface ProblemDetailsResponse {
  title?: string
  detail?: string
  errors?: Record<string, string[]>
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, headers, ...requestOptions } = options
  const token = getAuthToken()
  const requestHeaders = new Headers(headers)

  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (token) {
    requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...requestOptions,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  // A 401 for a request that sent a token means the session is no longer valid.
  // Without a token, such as a failed login, it is an ordinary error.
  if (response.status === 401 && token) {
    expireAuthSession(token)
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

async function readErrorMessage(response: Response) {
  const fallbackMessage = `Request failed with status ${response.status}`
  const text = await response.text()

  if (!text) {
    return fallbackMessage
  }

  try {
    const problem = JSON.parse(text) as ProblemDetailsResponse
    const validationMessages = Object.values(problem.errors ?? {}).flat()

    if (validationMessages.length > 0) {
      return validationMessages.join(' ')
    }

    return problem.detail ?? problem.title ?? fallbackMessage
  } catch {
    return text
  }
}
