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
  // The first validation message for each field, keyed by the request's
  // camelCase property name, such as { name: 'Enter a resource name.' }.
  readonly fieldErrors: Record<string, string>

  constructor(message: string, status: number, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
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
    const { message, fieldErrors } = await readError(response)
    throw new ApiError(message, response.status, fieldErrors)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

async function readError(response: Response) {
  const fallbackMessage = `Request failed with status ${response.status}`
  const text = await response.text()

  if (!text) {
    return { message: fallbackMessage, fieldErrors: {} }
  }

  try {
    const problem = JSON.parse(text) as ProblemDetailsResponse
    const fieldErrors = readFieldErrors(problem.errors ?? {})
    const validationMessages = Object.values(fieldErrors)

    if (validationMessages.length > 0) {
      return { message: validationMessages.join(' '), fieldErrors }
    }

    return { message: problem.detail ?? problem.title ?? fallbackMessage, fieldErrors }
  } catch {
    return { message: text, fieldErrors: {} }
  }
}

// ASP.NET Core names a field by its C# property ("ResourceId"), or by its JSON
// path ("$.startTime") when the value can't be read. Both become the request's
// property name, "resourceId" or "startTime". A field with several messages
// keeps the first, which is the most basic, such as "Enter a password."
// rather than "Password must be at least 8 characters.".
function readFieldErrors(errors: Record<string, string[]>) {
  const fieldErrors: Record<string, string> = {}

  for (const [key, messages] of Object.entries(errors)) {
    const property = key.replace(/^\$\./, '').split('.').at(-1) ?? key
    const field = property.charAt(0).toLowerCase() + property.slice(1)

    if (messages.length > 0 && !(field in fieldErrors)) {
      fieldErrors[field] = messages[0]
    }
  }

  return fieldErrors
}
