import type { BookingPolicyResponse, BookingRuleOverrides, ReservationResponse } from '../api/types'

// The default booking rules, as the API sends them.
export const testPolicy: BookingPolicyResponse = {
  minDurationMinutes: 15,
  maxDurationMinutes: 480,
  minLeadTimeMinutes: 0,
  maxAdvanceDays: 90,
  maxActiveReservationsPerUser: 5,
}

// A resource that follows the default booking rules.
export const noRuleOverrides: BookingRuleOverrides = {
  minDurationMinutes: null,
  maxDurationMinutes: null,
  minLeadTimeMinutes: null,
  maxAdvanceDays: null,
}

// A reservation that hasn't been moved or cancelled.
export const newReservationFields: Pick<
  ReservationResponse,
  'createdAt' | 'updatedAt' | 'cancelledAt' | 'cancelledByUserId' | 'cancelledByName' | 'version'
> = {
  createdAt: '2030-01-10T08:00:00+00:00',
  updatedAt: null,
  cancelledAt: null,
  cancelledByUserId: null,
  cancelledByName: null,
  version: 'AAAAAAAAB9E=',
}
