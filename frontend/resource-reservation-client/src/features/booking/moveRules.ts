import type { ReservationResponse } from '../../api/types'
import { nowInSchedulingZone } from '../../lib/dates'

// Why a booking can't be moved in a calendar, or null when it can. The API
// checks the same rules.
export function describeMoveProblem(reservation: ReservationResponse, selectedResourceId: number | null) {
  if (reservation.status === 'Cancelled') {
    return "This booking is cancelled, so it can't be moved."
  }

  if (reservation.startTime <= nowInSchedulingZone()) {
    return "This booking has started, so it can't be moved."
  }

  if (selectedResourceId === null) {
    return "This booking's resource isn't open for booking, so the booking can't be moved."
  }

  if (reservation.resourceId !== selectedResourceId) {
    return 'Bookings can only be moved to another time on the same resource.'
  }

  return null
}
