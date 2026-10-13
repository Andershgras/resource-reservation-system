import { ApiError } from '../api/client'

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong.'
}

// The message for a failed query, or an empty string while there is no error.
export function getQueryErrorMessage(error: unknown) {
  return error ? getErrorMessage(error) : ''
}

// Error messages for a form, keyed by field. An empty object means no errors.
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>

export const checkFieldsMessage = 'Check the highlighted fields.'

// Splits a failed request into messages beside the form's fields and one for
// the whole form. Validation messages for fields the form doesn't show stay
// in the form message, so none is lost.
export function getFormErrors<Field extends string>(
  error: unknown,
  fields: readonly Field[],
): { fieldErrors: FieldErrors<Field>; message: string } {
  if (!(error instanceof ApiError) || Object.keys(error.fieldErrors).length === 0) {
    return { fieldErrors: {}, message: getErrorMessage(error) }
  }

  const fieldErrors: FieldErrors<Field> = {}
  const otherMessages: string[] = []

  for (const [field, message] of Object.entries(error.fieldErrors)) {
    if ((fields as readonly string[]).includes(field)) {
      fieldErrors[field as Field] = message
    } else {
      otherMessages.push(message)
    }
  }

  return {
    fieldErrors,
    message: otherMessages.length > 0 ? otherMessages.join(' ') : checkFieldsMessage,
  }
}

export function hasFieldErrors(fieldErrors: FieldErrors<string>) {
  return Object.values(fieldErrors).some(Boolean)
}
