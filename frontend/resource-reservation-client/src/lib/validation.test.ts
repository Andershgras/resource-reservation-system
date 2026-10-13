import { describe, expect, it } from 'vitest'
import {
  validateAuthForm,
  validateAvailabilityForm,
  validateAvailabilityRuleForm,
  validateResourceForm,
} from './validation'

describe('validateAuthForm', () => {
  it('reports every missing field at once when registering', () => {
    expect(validateAuthForm('register', ' ', '', '')).toEqual({
      name: 'Enter your name.',
      email: 'Enter your email address.',
      password: 'Enter a password.',
    })
  })

  it('does not ask for a name or a minimum length when logging in', () => {
    expect(validateAuthForm('login', '', 'user@example.com', 'short')).toEqual({})
    expect(validateAuthForm('login', '', 'user@example.com', '')).toEqual({
      password: 'Enter your password.',
    })
  })

  it.each(['user', 'user@', '@example.com', 'us er@example.com'])('rejects the email %j', (email) => {
    expect(validateAuthForm('login', '', email, 'Password1').email).toBe('Enter a valid email address.')
  })

  it('rejects a short password when registering', () => {
    expect(validateAuthForm('register', 'Ada', 'ada@example.com', 'Pass1')).toEqual({
      password: 'Password must be at least 8 characters.',
    })
  })
})

describe('validateResourceForm', () => {
  it('requires a name that is not only spaces', () => {
    expect(validateResourceForm('  ')).toEqual({ name: 'Enter a resource name.' })
    expect(validateResourceForm('Room A')).toEqual({})
  })
})

describe('validateAvailabilityForm', () => {
  it('reports every missing field at once', () => {
    expect(validateAvailabilityForm('', '', '')).toEqual({
      resourceId: 'Select a resource.',
      startTime: 'Enter a start time.',
      endTime: 'Enter an end time.',
    })
  })

  it.each([
    ['2030-01-15T10:00', '2030-01-15T10:00'],
    ['2030-01-15T10:00', '2030-01-15T09:00'],
    ['2030-01-15T10:00', '2030-01-14T23:00'],
  ])('rejects %j to %j', (startTime, endTime) => {
    expect(validateAvailabilityForm('1', startTime, endTime)).toEqual({
      endTime: 'End time must be after start time.',
    })
  })

  it('compares wall-clock times in the hour repeated when summer time ends', () => {
    expect(validateAvailabilityForm('1', '2030-10-27T02:15', '2030-10-27T02:45')).toEqual({})
  })

  it('accepts a complete window', () => {
    expect(validateAvailabilityForm('1', '2030-01-15T09:00', '2030-01-15T10:00')).toEqual({})
  })
})

describe('validateAvailabilityRuleForm', () => {
  it('reports every missing field at once', () => {
    expect(validateAvailabilityRuleForm('', '', '', '')).toEqual({
      resourceId: 'Select a resource.',
      dayOfWeek: 'Select a weekday.',
      startTime: 'Enter a start time.',
      endTime: 'Enter an end time.',
    })
  })

  it.each([
    ['16:00', '08:00'],
    ['08:00', '08:00'],
  ])('rejects %j to %j', (startTime, endTime) => {
    expect(validateAvailabilityRuleForm('1', '1', startTime, endTime)).toEqual({
      endTime: 'End time must be after start time.',
    })
  })

  it('accepts Sunday, which is day 0', () => {
    expect(validateAvailabilityRuleForm('1', '0', '08:00', '16:00')).toEqual({})
  })
})
