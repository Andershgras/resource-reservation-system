import type { BookingPolicyResponse } from '../api/types'
import {
  bookingRuleFields,
  emptyBookingRules,
  type BookingRuleField,
  type BookingRulesDraft,
} from './bookingRules'
import type { FieldErrors } from './errors'

// Client-side checks that run before a form is sent. Each returns the errors
// for every field at once, so the user can fix them together. An empty
// object means the input is valid.

export type AuthField = 'name' | 'email' | 'password'

// The API checks the same rules, and more, such as passwords needing a number.
export function validateAuthForm(
  mode: 'login' | 'register',
  name: string,
  email: string,
  password: string,
): FieldErrors<AuthField> {
  const errors: FieldErrors<AuthField> = {}

  if (mode === 'register' && !name.trim()) {
    errors.name = 'Enter your name.'
  }

  if (!email.trim()) {
    errors.email = 'Enter your email address.'
  } else if (!/^[^\s@]+@[^\s@]+$/.test(email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (!password) {
    errors.password = mode === 'register' ? 'Enter a password.' : 'Enter your password.'
  } else if (mode === 'register' && password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }

  return errors
}

export function validateEmailForm(email: string): FieldErrors<'email'> {
  if (!email.trim()) {
    return { email: 'Enter your email address.' }
  }

  return /^[^\s@]+@[^\s@]+$/.test(email.trim()) ? {} : { email: 'Enter a valid email address.' }
}

export type ResetPasswordField = 'name' | 'password' | 'confirmPassword'

// The name is only asked for when the reset sets up an unconfirmed account.
export function validateResetPasswordForm(
  needsName: boolean,
  name: string,
  password: string,
  confirmPassword: string,
): FieldErrors<ResetPasswordField> {
  const errors: FieldErrors<ResetPasswordField> = {}

  if (needsName && !name.trim()) {
    errors.name = 'Enter your name.'
  }

  if (!password) {
    errors.password = 'Enter a new password.'
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }

  if (password && confirmPassword !== password) {
    errors.confirmPassword = "The passwords don't match."
  }

  return errors
}

export type ResourceField = 'name' | 'description' | 'location' | BookingRuleField

// The limits the API accepts for each booking rule, with its message.
const bookingRuleLimits: Record<BookingRuleField, { min: number; max: number; message: string }> = {
  minDurationMinutes: { min: 1, max: 10080, message: 'Enter a minimum duration between 1 and 10080 minutes.' },
  maxDurationMinutes: { min: 1, max: 10080, message: 'Enter a maximum duration between 1 and 10080 minutes.' },
  minLeadTimeMinutes: { min: 0, max: 43200, message: 'Enter a notice period between 0 and 43200 minutes.' },
  maxAdvanceDays: { min: 1, max: 3650, message: 'Enter a number of days between 1 and 3650.' },
}

// Booking rules are optional. The minimum duration is compared with the
// maximum in force, which is the default when the field is empty, as the API
// does. Without the defaults, that comparison is left to the API.
export function validateResourceForm(
  name: string,
  rules: BookingRulesDraft = emptyBookingRules,
  defaults?: BookingPolicyResponse,
): FieldErrors<ResourceField> {
  const errors: FieldErrors<ResourceField> = {}

  if (!name.trim()) {
    errors.name = 'Enter a resource name.'
  }

  for (const field of bookingRuleFields) {
    const text = rules[field].trim()
    const { min, max, message } = bookingRuleLimits[field]

    if (text !== '' && (!/^\d+$/.test(text) || Number(text) < min || Number(text) > max)) {
      errors[field] = message
    }
  }

  if (!errors.minDurationMinutes && !errors.maxDurationMinutes && rules.minDurationMinutes.trim() !== '') {
    const minimum = Number(rules.minDurationMinutes)

    if (rules.maxDurationMinutes.trim() !== '') {
      if (minimum > Number(rules.maxDurationMinutes)) {
        errors.maxDurationMinutes = "The maximum duration can't be shorter than the minimum duration."
      }
    } else if (defaults && minimum > defaults.maxDurationMinutes) {
      errors.minDurationMinutes =
        `The minimum duration can't be longer than the default maximum of ${defaults.maxDurationMinutes} minutes.`
    }
  }

  return errors
}

export type AvailabilityField = 'resourceId' | 'startTime' | 'endTime'

export function validateAvailabilityForm(
  resourceId: string,
  startTime: string,
  endTime: string,
): FieldErrors<AvailabilityField> {
  const errors: FieldErrors<AvailabilityField> = {}

  if (!resourceId) {
    errors.resourceId = 'Select a resource.'
  }

  if (!startTime) {
    errors.startTime = 'Enter a start time.'
  }

  if (!endTime) {
    errors.endTime = 'Enter an end time.'
  } else if (startTime && endTime <= startTime) {
    errors.endTime = 'End time must be after start time.'
  }

  return errors
}

export type AvailabilityRuleField = 'resourceId' | 'dayOfWeek' | 'startTime' | 'endTime'

export function validateAvailabilityRuleForm(
  resourceId: string,
  dayOfWeek: string,
  startTime: string,
  endTime: string,
): FieldErrors<AvailabilityRuleField> {
  const errors: FieldErrors<AvailabilityRuleField> = {}

  if (!resourceId) {
    errors.resourceId = 'Select a resource.'
  }

  if (!dayOfWeek) {
    errors.dayOfWeek = 'Select a weekday.'
  }

  if (!startTime) {
    errors.startTime = 'Enter a start time.'
  }

  if (!endTime) {
    errors.endTime = 'Enter an end time.'
  } else if (startTime && endTime <= startTime) {
    errors.endTime = 'End time must be after start time.'
  }

  return errors
}

export type ClosureField = 'resourceId' | 'startTime' | 'endTime' | 'reason'

export function validateClosureForm(
  resourceId: string,
  startTime: string,
  endTime: string,
  reason: string,
): FieldErrors<ClosureField> {
  const errors: FieldErrors<ClosureField> = validateAvailabilityForm(resourceId, startTime, endTime)

  if (!reason.trim()) {
    errors.reason = 'Enter a reason, such as a holiday or maintenance.'
  } else if (reason.trim().length > 200) {
    errors.reason = 'Reason must be 200 characters or fewer.'
  }

  return errors
}
