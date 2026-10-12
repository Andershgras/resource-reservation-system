import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { ReservationResponse, ReservationStatus } from '../../api/types'
import { useConfirm } from '../../components/confirmContext'
import { ReservationsSection } from '../../components/ReservationsSection'
import { formatDateTime } from '../../lib/dates'
import { getErrorMessage, getQueryErrorMessage } from '../../lib/errors'
import { useResources } from '../resources/resourceQueries'
import { useAllReservations, useCancelReservation } from './reservationQueries'

const statuses: ReservationStatus[] = ['Active', 'Cancelled']

// /admin/reservations: every reservation, filtered by resource and status.
// The filters are kept in the address, such as ?resource=3&status=Active.
// Values that don't make sense are ignored.
export function AdminReservationsPage() {
  const resourcesQuery = useResources()
  const reservationsQuery = useAllReservations()
  const cancelReservation = useCancelReservation()
  const confirm = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const [message, setMessage] = useState('')
  const resourceFilter = parseResourceFilter(searchParams.get('resource'))
  const statusFilter = parseStatusFilter(searchParams.get('status'))
  const hasFilters = resourceFilter !== '' || statusFilter !== ''

  const filteredReservations = useMemo(
    () =>
      (reservationsQuery.data ?? []).filter((reservation) =>
        (resourceFilter === '' || reservation.resourceId === Number(resourceFilter)) &&
        (statusFilter === '' || reservation.status === statusFilter)),
    [reservationsQuery.data, resourceFilter, statusFilter],
  )

  function setFilter(name: 'resource' | 'status', value: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)

      if (value) {
        next.set(name, value)
      } else {
        next.delete(name)
      }

      return next
    }, { replace: true })
  }

  function handleCancel(reservation: ReservationResponse) {
    confirm({
      title: 'Cancel reservation',
      message: `Cancel reservation for "${reservation.resourceName}"?`,
      confirmLabel: 'Cancel reservation',
      onConfirm: async () => {
        setMessage('')

        try {
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
      title="Reservations"
      reservations={filteredReservations}
      isLoading={reservationsQuery.isPending}
      message={message || getQueryErrorMessage(reservationsQuery.error)}
      showUserId
      filterResources={resourcesQuery.data ?? []}
      selectedResourceId={resourceFilter}
      selectedStatus={statusFilter}
      onSelectedResourceIdChange={(resourceId) => setFilter('resource', resourceId)}
      onSelectedStatusChange={(status) => setFilter('status', status)}
      onClearFilters={() => setSearchParams({}, { replace: true })}
      emptyMessage={
        hasFilters ? 'No reservations match the selected filters.' : 'No reservations found.'
      }
      cancellingReservationId={cancelReservation.isPending ? cancelReservation.variables : null}
      onCancelReservation={handleCancel}
      formatDateTime={formatDateTime}
    />
  )
}

function parseResourceFilter(value: string | null) {
  return value && /^[1-9]\d{0,9}$/.test(value) ? value : ''
}

function parseStatusFilter(value: string | null): '' | ReservationStatus {
  return statuses.find((status) => status === value) ?? ''
}
