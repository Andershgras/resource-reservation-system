import type { BookableSlotResponse } from '../api/types'

// Client-side checks that run before a form is sent. Each returns an error
// message, or an empty string when the input is valid.

export function validateAvailabilityForm(
  resourceId: string,
  startTime: string,
  endTime: string,
) {
  if (!resourceId) {
    return 'Select a resource before saving availability.'
  }

  if (!startTime) {
    return 'Enter a start time before saving availability.'
  }

  if (!endTime) {
    return 'Enter an end time before saving availability.'
  }

  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    return 'End time must be after start time.'
  }

  return ''
}

export function validateAvailabilityRuleForm(
  resourceId: string,
  dayOfWeek: string,
  startTime: string,
  endTime: string,
) {
  if (!resourceId) {
    return 'Select a resource before saving a weekly schedule.'
  }

  if (!dayOfWeek) {
    return 'Select a weekday before saving a weekly schedule.'
  }

  if (!startTime) {
    return 'Enter a start time before saving a weekly schedule.'
  }

  if (!endTime) {
    return 'Enter an end time before saving a weekly schedule.'
  }

  if (endTime <= startTime) {
    return 'End time must be after start time.'
  }

  return ''
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
