import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { ReservationResponse, ReservationStatus } from '../../api/types'
import { useConfirm } from '../../components/confirmContext'
import { ReservationsSection } from '../../components/ReservationsSection'
import { errorNotice, getErrorMessage } from '../../lib/errors'
import type { Notice } from '../../ui/Alert'
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
  const [notice, setNotice] = useState<Notice | null>(null)
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
        setNotice(null)

        try {
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
      title="Reservations"
      reservations={filteredReservations}
      isLoading={reservationsQuery.isPending}
      notice={notice ?? errorNotice(reservationsQuery.error)}
      showUser
      filterResources={resourcesQuery.data ?? []}
      selectedResourceId={resourceFilter}
      selectedStatus={statusFilter}
      onSelectedResourceIdChange={(resourceId) => setFilter('resource', resourceId)}
      onSelectedStatusChange={(status) => setFilter('status', status)}
      onClearFilters={() => setSearchParams({}, { replace: true })}
      emptyMessage={
        hasFilters ? 'No reservations match the selected filters.' : 'No reservations found.'
      }
      emptyDescription={hasFilters ? 'Try another resource or status, or clear the filters.' : undefined}
      cancellingReservationId={cancelReservation.isPending ? cancelReservation.variables.id : null}
      onCancelReservation={handleCancel}
    />
  )
}

function parseResourceFilter(value: string | null) {
  return value && /^[1-9]\d{0,9}$/.test(value) ? value : ''
}

function parseStatusFilter(value: string | null): '' | ReservationStatus {
  return statuses.find((status) => status === value) ?? ''
}
