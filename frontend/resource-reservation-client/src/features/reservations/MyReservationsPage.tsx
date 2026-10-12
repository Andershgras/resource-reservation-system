import { useState } from 'react'
import type { ReservationResponse } from '../../api/types'
import { useConfirm } from '../../components/confirmContext'
import { ReservationsSection } from '../../components/ReservationsSection'
import { formatDateTime } from '../../lib/dates'
import { getErrorMessage, getQueryErrorMessage } from '../../lib/errors'
import { useCancelReservation, useMyReservations } from './reservationQueries'

// /my-reservations: the user's own reservations.
export function MyReservationsPage() {
  const reservationsQuery = useMyReservations()
  const cancelReservation = useCancelReservation()
  const confirm = useConfirm()
  const [message, setMessage] = useState('')

  function handleCancel(reservation: ReservationResponse) {
    confirm({
      title: 'Cancel reservation',
      message: `Cancel reservation for "${reservation.resourceName}"?`,
      confirmLabel: 'Cancel reservation',
      onConfirm: async () => {
        setMessage('')

        try {
          // Also reloads the booking schedule, so the time shows as free again.
          await cancelReservation.mutateAsync(reservation.id)
          setMessage('Reservation cancelled.')
        } catch (error) {
          setMessage(getErrorMessage(error))
        }
      },
    })
  }

  return (
    <ReservationsSection
      title="My reservations"
      reservations={reservationsQuery.data ?? []}
      isLoading={reservationsQuery.isPending}
      message={message || getQueryErrorMessage(reservationsQuery.error)}
      cancellingReservationId={cancelReservation.isPending ? cancelReservation.variables : null}
      onCancelReservation={handleCancel}
      formatDateTime={formatDateTime}
    />
  )
}
