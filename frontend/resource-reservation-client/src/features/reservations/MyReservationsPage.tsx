import { useState } from 'react'
import type { ReservationResponse } from '../../api/types'
import { useConfirm } from '../../components/confirmContext'
import { ReservationsSection } from '../../components/ReservationsSection'
import { errorNotice, getErrorMessage } from '../../lib/errors'
import type { Notice } from '../../ui/Alert'
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
    />
  )
}
