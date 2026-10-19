import {
  expireSession,
  expireSessionIfDue,
  getSessionGeneration,
  isSignedIn,
} from '../auth/authSession'

// The API is on the same origin, behind nginx in production and the Vite dev
// server's proxy in development, so the browser sends the session cookie with
// every request (ADR 0012).
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

// The header the API expects the anti-forgery token in, and the code of its
// 403 when the token is missing or out of date.
const csrfHeaderName = 'X-CSRF-TOKEN'
const csrfRejectedCode = 'csrf_token_invalid'
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

// RFC 9457 problem details, as returned by the API for every error.
// Validation errors add `errors`, keyed by field name. Some errors add a
// machine-readable `code`.
interface ProblemDetailsResponse {
  title?: string
  detail?: string
  errors?: Record<string, string[]>
  code?: string
}

export class ApiError extends Error {
  readonly status: number
  // The first validation message for each field, keyed by the request's
  // camelCase property name, such as { name: 'Enter a resource name.' }.
  readonly fieldErrors: Record<string, string>
  readonly code: string | undefined

  constructor(
    message: string,
    status: number,
    fieldErrors: Record<string, string> = {},
    code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.code = code
  }
}

// The anti-forgery token for requests that change something. It is bound to
// the signed-in user, so it is fetched again after signing in or out. Parallel
// requests share one fetch: each first fetch sets a new anti-forgery cookie,
// and only the last one's token would match it.
let csrfToken: Promise<string> | null = null

export function invalidateCsrfToken() {
  csrfToken = null
}

function getCsrfToken() {
  if (!csrfToken) {
    const pending = fetch(`${apiBaseUrl}/auth/csrf`)
      .then(async (response) => {
        if (!response.ok) {
          const { message, fieldErrors, code } = await readError(response)
          throw new ApiError(message, response.status, fieldErrors, code)
        }

        return (await response.json() as { token: string }).token
      })
      .catch((error: unknown) => {
        if (csrfToken === pending) {
          csrfToken = null
        }

        throw error
      })

    csrfToken = pending
  }

  return csrfToken
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  // A session whose time is up ends before anything is sent.
  expireSessionIfDue()

  // Which session this request belongs to, read before anything is awaited.
  const generation = getSessionGeneration()
  const signedIn = isSignedIn()
  const method = (options.method ?? 'GET').toUpperCase()
  let response = await send(path, options, method)

  // A token that is out of date, for example after the API restarted without
  // its keys, is fetched again once.
  if (response.status === 403 && !safeMethods.has(method) &&
    await readCode(response.clone()) === csrfRejectedCode) {
    invalidateCsrfToken()
    response = await send(path, options, method)
  }

  // Signing in or out changes who the token is for.
  if (path === '/auth/login' || path === '/auth/logout') {
    invalidateCsrfToken()
  }

  // A 401 for a request made while signed in means the session is no longer
  // valid. Signed out, such as a failed login, it is an ordinary error.
  if (response.status === 401 && signedIn) {
    invalidateCsrfToken()
    expireSession(generation)
  }

  if (!response.ok) {
    const { message, fieldErrors, code } = await readError(response)
    throw new ApiError(message, response.status, fieldErrors, code)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

async function send(path: string, options: ApiRequestOptions, method: string) {
  const { body, headers, ...requestOptions } = options
  const requestHeaders = new Headers(headers)

  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (!safeMethods.has(method)) {
    requestHeaders.set(csrfHeaderName, await getCsrfToken())
  }

  return fetch(`${apiBaseUrl}${path}`, {
    ...requestOptions,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function readCode(response: Response) {
  try {
    return (await response.json() as ProblemDetailsResponse).code
  } catch {
    return undefined
  }
}

async function readError(response: Response) {
  const fallbackMessage = `Request failed with status ${response.status}`
  const text = await response.text()

  if (!text) {
    return { message: fallbackMessage, fieldErrors: {}, code: undefined }
  }

  try {
    const problem = JSON.parse(text) as ProblemDetailsResponse
    const fieldErrors = readFieldErrors(problem.errors ?? {})
    const validationMessages = Object.values(fieldErrors)

    if (validationMessages.length > 0) {
      return { message: validationMessages.join(' '), fieldErrors, code: problem.code }
    }

    return { message: problem.detail ?? problem.title ?? fallbackMessage, fieldErrors, code: problem.code }
  } catch {
    return { message: text, fieldErrors: {}, code: undefined }
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
