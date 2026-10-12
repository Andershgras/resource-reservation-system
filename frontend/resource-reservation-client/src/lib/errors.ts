import { ApiError } from '../api/client'

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `Error: ${error.message}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong.'
}

// The message for a failed query, or an empty string while there is no error.
export function getQueryErrorMessage(error: unknown) {
  return error ? getErrorMessage(error) : ''
}
