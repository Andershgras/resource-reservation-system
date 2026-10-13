import { describe, expect, it } from 'vitest'
import {
  validateAuthForm,
  validateAvailabilityForm,
  validateAvailabilityRuleForm,
  validateResourceForm,
} from './validation'
import { emptyBookingRules } from './bookingRules'
import { testPolicy } from '../test/fixtures'

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
  const rules = { ...emptyBookingRules }

  it('requires a name that is not only spaces', () => {
    expect(validateResourceForm('  ')).toEqual({ name: 'Enter a resource name.' })
    expect(validateResourceForm('Room A')).toEqual({})
  })

  it('accepts empty booking rules, which mean the defaults', () => {
    expect(validateResourceForm('Room A', rules, testPolicy)).toEqual({})
  })

  it('reports booking rules outside what the API accepts', () => {
    expect(validateResourceForm('Room A', {
      minDurationMinutes: '0',
      maxDurationMinutes: '1.5',
      minLeadTimeMinutes: '-5',
      maxAdvanceDays: '4000',
    })).toEqual({
      minDurationMinutes: 'Enter a minimum duration between 1 and 10080 minutes.',
      maxDurationMinutes: 'Enter a maximum duration between 1 and 10080 minutes.',
      minLeadTimeMinutes: 'Enter a notice period between 0 and 43200 minutes.',
      maxAdvanceDays: 'Enter a number of days between 1 and 3650.',
    })
  })

  it('compares the minimum with the maximum in force, as the API does', () => {
    expect(validateResourceForm('Room A', { ...rules, minDurationMinutes: '60', maxDurationMinutes: '30' }))
      .toEqual({ maxDurationMinutes: "The maximum duration can't be shorter than the minimum duration." })
    expect(validateResourceForm('Room A', { ...rules, minDurationMinutes: '600' }, testPolicy)).toEqual({
      minDurationMinutes: "The minimum duration can't be longer than the default maximum of 480 minutes.",
    })
    // Without the defaults, the API checks it instead.
    expect(validateResourceForm('Room A', { ...rules, minDurationMinutes: '600' })).toEqual({})
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
