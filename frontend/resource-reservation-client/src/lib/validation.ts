import type { BookableSlotResponse } from '../api/types'
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

export type ResourceField = 'name' | 'description' | 'location'

export function validateResourceForm(name: string): FieldErrors<ResourceField> {
  return name.trim() ? {} : { name: 'Enter a resource name.' }
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

export function validateReservationSlotSelection(
  slot: BookableSlotResponse,
  startTime: string,
  endTime: string,
) {
  if (!startTime) {
    return 'Select a reservation start time.'
  }

  if (!endTime) {
    return 'Select a reservation end time.'
  }

  const selectedStartTime = new Date(startTime).getTime()
  const selectedEndTime = new Date(endTime).getTime()
  const slotStartTime = new Date(slot.startTime).getTime()
  const slotEndTime = new Date(slot.endTime).getTime()

  if (Number.isNaN(selectedStartTime) || Number.isNaN(selectedEndTime)) {
    return 'Select valid reservation start and end times.'
  }

  if (selectedEndTime <= selectedStartTime) {
    return 'Reservation end time must be after start time.'
  }

  if (selectedStartTime < slotStartTime || selectedEndTime > slotEndTime) {
    return 'Reservation time must stay inside the selected bookable time.'
  }

  return ''
}
