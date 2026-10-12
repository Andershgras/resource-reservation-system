import { describe, expect, it } from 'vitest'
import {
  validateAvailabilityForm,
  validateAvailabilityRuleForm,
  validateReservationSlotSelection,
} from './validation'

describe('validateAvailabilityForm', () => {
  it.each([
    ['', '2030-01-15T09:00', '2030-01-15T10:00', 'Select a resource before saving availability.'],
    ['1', '', '2030-01-15T10:00', 'Enter a start time before saving availability.'],
    ['1', '2030-01-15T09:00', '', 'Enter an end time before saving availability.'],
    ['1', '2030-01-15T10:00', '2030-01-15T10:00', 'End time must be after start time.'],
    ['1', '2030-01-15T10:00', '2030-01-15T09:00', 'End time must be after start time.'],
  ])('rejects resource %j from %j to %j', (resourceId, startTime, endTime, expected) => {
    expect(validateAvailabilityForm(resourceId, startTime, endTime)).toBe(expected)
  })

  it('accepts a complete window', () => {
    expect(validateAvailabilityForm('1', '2030-01-15T09:00', '2030-01-15T10:00')).toBe('')
  })
})

describe('validateAvailabilityRuleForm', () => {
  it.each([
    ['', '1', '08:00', '16:00', 'Select a resource before saving a weekly schedule.'],
    ['1', '', '08:00', '16:00', 'Select a weekday before saving a weekly schedule.'],
    ['1', '1', '', '16:00', 'Enter a start time before saving a weekly schedule.'],
    ['1', '1', '08:00', '', 'Enter an end time before saving a weekly schedule.'],
    ['1', '1', '16:00', '08:00', 'End time must be after start time.'],
    ['1', '1', '08:00', '08:00', 'End time must be after start time.'],
  ])('rejects resource %j, day %j, %j to %j', (resourceId, day, startTime, endTime, expected) => {
    expect(validateAvailabilityRuleForm(resourceId, day, startTime, endTime)).toBe(expected)
  })

  it('accepts Sunday, which is day 0', () => {
    expect(validateAvailabilityRuleForm('1', '0', '08:00', '16:00')).toBe('')
  })
})

describe('validateReservationSlotSelection', () => {
  const slot = { startTime: '2030-01-15T08:00:00', endTime: '2030-01-15T12:00:00' }

  it('accepts a time inside the slot', () => {
    expect(validateReservationSlotSelection(slot, '2030-01-15T09:00', '2030-01-15T10:00')).toBe('')
  })

  it('accepts exactly the whole slot', () => {
    expect(validateReservationSlotSelection(slot, '2030-01-15T08:00', '2030-01-15T12:00')).toBe('')
  })

  it.each([
    ['', '2030-01-15T10:00', 'Select a reservation start time.'],
    ['2030-01-15T09:00', '', 'Select a reservation end time.'],
    ['not-a-date', '2030-01-15T10:00', 'Select valid reservation start and end times.'],
    ['2030-01-15T10:00', '2030-01-15T10:00', 'Reservation end time must be after start time.'],
    ['2030-01-15T07:59', '2030-01-15T10:00', 'Reservation time must stay inside the selected bookable time.'],
    ['2030-01-15T09:00', '2030-01-15T12:01', 'Reservation time must stay inside the selected bookable time.'],
  ])('rejects %j to %j', (startTime, endTime, expected) => {
    expect(validateReservationSlotSelection(slot, startTime, endTime)).toBe(expected)
  })
})
