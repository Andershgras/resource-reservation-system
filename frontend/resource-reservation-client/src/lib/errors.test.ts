import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { getErrorMessage } from './errors'
import { emptyToNull } from './text'

describe('getErrorMessage', () => {
  it('prefixes API errors', () => {
    expect(getErrorMessage(new ApiError('Resource not found.', 404))).toBe('Error: Resource not found.')
  })

  it('shows other errors as they are', () => {
    expect(getErrorMessage(new Error('Network down'))).toBe('Network down')
  })

  it('falls back to a generic message', () => {
    expect(getErrorMessage('unexpected')).toBe('Something went wrong.')
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
