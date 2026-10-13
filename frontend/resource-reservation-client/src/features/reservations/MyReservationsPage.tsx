import { useState } from 'react'
import type { ReservationResponse } from '../../api/types'
import { useConfirm } from '../../components/confirmContext'
import { ReservationsSection } from '../../components/ReservationsSection'
import { startOfWeek } from '../../lib/calendar'
import { getDateKey, nowInSchedulingZone } from '../../lib/dates'
import { errorNotice, getErrorMessage } from '../../lib/errors'
import type { Notice } from '../../ui/Alert'
import { toBookingSearch } from '../booking/bookingSearch'
import { useCancelReservation, useMyReservations } from './reservationQueries'

// /my-reservations: the user's own reservations.
export function MyReservationsPage() {
  const reservationsQuery = useMyReservations()
  const cancelReservation = useCancelReservation()
  const confirm = useConfirm()
  const [notice, setNotice] = useState<Notice | null>(null)

  function handleCancel(reservation: ReservationResponse) {
    confirm({
      title: 'Cancel reservation',
      message: `Cancel reservation for "${reservation.resourceName}"?`,
      confirmLabel: 'Cancel reservation',
      onConfirm: async () => {
        setNotice(null)

        try {
          // Also reloads the booking schedule, so the time shows as free again.
          await cancelReservation.mutateAsync(reservation)
          setNotice({ tone: 'success', text: 'Reservation cancelled.' })
        } catch (error) {
          setNotice({ tone: 'danger', text: getErrorMessage(error) })
        }
      },
    })
  }

  return (
    <ReservationsSection
      title="My reservations"
      reservations={reservationsQuery.data ?? []}
      isLoading={reservationsQuery.isPending}
      notice={notice ?? errorNotice(reservationsQuery.error)}
      emptyDescription="Book a resource and your reservations show up here."
      cancellingReservationId={cancelReservation.isPending ? cancelReservation.variables.id : null}
      onCancelReservation={handleCancel}
      moveLinkFor={moveLinkFor}
    />
  )
}

// The booking calendar at the reservation's week, in move mode. Only bookings
// that haven't started can be moved.
function moveLinkFor(reservation: ReservationResponse) {
  if (reservation.startTime <= nowInSchedulingZone()) {
    return null
  }

  const search = toBookingSearch({
    resourceId: reservation.resourceId,
    weekStart: startOfWeek(getDateKey(reservation.startTime)),
    moveReservationId: reservation.id,
  })

  return `/book${search}`
}
