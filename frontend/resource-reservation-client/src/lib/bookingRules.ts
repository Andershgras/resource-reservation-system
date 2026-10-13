import type { BookingPolicyResponse } from '../api/types'
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
