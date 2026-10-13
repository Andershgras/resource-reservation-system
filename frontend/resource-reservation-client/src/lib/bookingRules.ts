import type { BookingPolicyResponse, BookingRuleOverrides } from '../api/types'
import { formatMinutes } from './calendar'

// The booking rules as a sentence for people booking, such as "Bookings last
// 15 min to 8 h and can be made up to 90 days ahead. You can have up to 5
// upcoming bookings."
export function describeBookingRules(policy: BookingPolicyResponse) {
  const notice = policy.minLeadTimeMinutes > 0
    ? `, at least ${formatMinutes(policy.minLeadTimeMinutes)} in advance and`
    : ' and can be made'
  const days = policy.maxAdvanceDays === 1 ? '1 day' : `${policy.maxAdvanceDays} days`

  return (
    `Bookings last ${formatMinutes(policy.minDurationMinutes)} to ${formatMinutes(policy.maxDurationMinutes)}` +
    `${notice} up to ${days} ahead. ` +
    `You can have up to ${policy.maxActiveReservationsPerUser} upcoming bookings.`
  )
}

export const bookingRuleFields = [
  'minDurationMinutes',
  'maxDurationMinutes',
  'minLeadTimeMinutes',
  'maxAdvanceDays',
] as const

export type BookingRuleField = (typeof bookingRuleFields)[number]

// A resource's own booking rules as typed into a form. Empty means the
// resource uses the default.
export type BookingRulesDraft = Record<BookingRuleField, string>

export const emptyBookingRules: BookingRulesDraft = {
  minDurationMinutes: '',
  maxDurationMinutes: '',
  minLeadTimeMinutes: '',
  maxAdvanceDays: '',
}

export function toBookingRulesDraft(overrides: BookingRuleOverrides): BookingRulesDraft {
  return {
    minDurationMinutes: overrides.minDurationMinutes?.toString() ?? '',
    maxDurationMinutes: overrides.maxDurationMinutes?.toString() ?? '',
    minLeadTimeMinutes: overrides.minLeadTimeMinutes?.toString() ?? '',
    maxAdvanceDays: overrides.maxAdvanceDays?.toString() ?? '',
  }
}

// For a valid draft. Empty fields become null, meaning "use the default".
export function toBookingRuleOverrides(draft: BookingRulesDraft): BookingRuleOverrides {
  const value = (text: string) => (text.trim() === '' ? null : Number(text))

  return {
    minDurationMinutes: value(draft.minDurationMinutes),
    maxDurationMinutes: value(draft.maxDurationMinutes),
    minLeadTimeMinutes: value(draft.minLeadTimeMinutes),
    maxAdvanceDays: value(draft.maxAdvanceDays),
  }
}

// The rules a resource sets for itself, such as "At most 1 h, 2 h notice",
// or null when it uses the defaults for all of them.
export function describeRuleOverrides(overrides: BookingRuleOverrides) {
  const parts = [
    overrides.minDurationMinutes !== null && `at least ${formatMinutes(overrides.minDurationMinutes)}`,
    overrides.maxDurationMinutes !== null && `at most ${formatMinutes(overrides.maxDurationMinutes)}`,
    overrides.minLeadTimeMinutes !== null &&
      (overrides.minLeadTimeMinutes === 0 ? 'no notice' : `${formatMinutes(overrides.minLeadTimeMinutes)} notice`),
    overrides.maxAdvanceDays !== null &&
      `up to ${overrides.maxAdvanceDays === 1 ? '1 day' : `${overrides.maxAdvanceDays} days`} ahead`,
  ].filter((part): part is string => Boolean(part))

  if (parts.length === 0) {
    return null
  }

  const text = parts.join(', ')

  return text.charAt(0).toUpperCase() + text.slice(1)
}
