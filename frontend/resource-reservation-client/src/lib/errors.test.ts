import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { checkFieldsMessage, getErrorMessage, getFormErrors, hasFieldErrors } from './errors'
import { emptyToNull } from './text'

describe('getErrorMessage', () => {
  it('shows the message of an error', () => {
    expect(getErrorMessage(new ApiError('Resource not found.', 404))).toBe('Resource not found.')
    expect(getErrorMessage(new Error('Network down'))).toBe('Network down')
  })

  it('falls back to a generic message', () => {
    expect(getErrorMessage('unexpected')).toBe('Something went wrong.')
  })
})

describe('getFormErrors', () => {
  const fields = ['name', 'location'] as const

  it('puts validation messages beside the fields the form shows', () => {
    const error = new ApiError('Enter a resource name.', 400, { name: 'Enter a resource name.' })

    expect(getFormErrors(error, fields)).toEqual({
      fieldErrors: { name: 'Enter a resource name.' },
      message: checkFieldsMessage,
    })
  })

  it('keeps messages for fields the form does not show in the form message', () => {
    const error = new ApiError('', 400, {
      name: 'Enter a resource name.',
      request: 'The request field is required.',
    })

    expect(getFormErrors(error, fields)).toEqual({
      fieldErrors: { name: 'Enter a resource name.' },
      message: 'The request field is required.',
    })
  })

  it('uses the whole message for errors without fields', () => {
    expect(getFormErrors(new ApiError('Resource is already reserved.', 409), fields)).toEqual({
      fieldErrors: {},
      message: 'Resource is already reserved.',
    })
    expect(getFormErrors(new Error('Network down'), fields)).toEqual({
      fieldErrors: {},
      message: 'Network down',
    })
  })
})

describe('hasFieldErrors', () => {
  it('is true only when a field has a message', () => {
    expect(hasFieldErrors({})).toBe(false)
    expect(hasFieldErrors({ name: undefined })).toBe(false)
    expect(hasFieldErrors({ name: 'Enter a resource name.' })).toBe(true)
  })
})

describe('emptyToNull', () => {
  it.each([[''], ['   ']])('turns %j into null', (value) => {
    expect(emptyToNull(value)).toBeNull()
  })

  it('trims other text', () => {
    expect(emptyToNull('  Floor 2 ')).toBe('Floor 2')
  })
})
