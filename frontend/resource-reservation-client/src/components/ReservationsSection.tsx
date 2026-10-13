import type {
  ReservationResponse,
  ReservationStatus,
  ResourceResponse,
} from '../api/types'
import { formatDateTimeRange } from '../lib/dates'
import { Alert, type Notice } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Field, Select } from '../ui/Field'
import { EmptyState, LoadingState } from '../ui/States'
import './lists.css'

interface ReservationsSectionProps {
  title: string
  reservations: ReservationResponse[]
  isLoading: boolean
  notice: Notice | null
  showUser?: boolean
  filterResources?: ResourceResponse[]
  selectedResourceId?: string
  selectedStatus?: '' | ReservationStatus
  onSelectedResourceIdChange?: (resourceId: string) => void
  onSelectedStatusChange?: (status: '' | ReservationStatus) => void
  onClearFilters?: () => void
  emptyMessage?: string
  emptyDescription?: string
  cancellingReservationId: number | null
  onCancelReservation: (reservation: ReservationResponse) => void
}

export function ReservationsSection({
  title,
  reservations,
  isLoading,
  notice,
  showUser = false,
  filterResources,
  selectedResourceId = '',
  selectedStatus = '',
  onSelectedResourceIdChange,
  onSelectedStatusChange,
  onClearFilters,
  emptyMessage = 'No reservations found.',
  emptyDescription,
  cancellingReservationId,
  onCancelReservation,
}: ReservationsSectionProps) {
  const showFilters =
    filterResources &&
    onSelectedResourceIdChange &&
    onSelectedStatusChange &&
    onClearFilters
  const hasActiveFilters = selectedResourceId !== '' || selectedStatus !== ''

  return (
    <Card
      title={title}
      actions={<Badge label={`${reservations.length} reservations`}>{reservations.length}</Badge>}
    >
      {showFilters && (
        <div className="list-filters" role="group" aria-label="Reservation filters">
          <Field label="Resource">
            {(props) => (
              <Select
                {...props}
                value={selectedResourceId}
                onChange={(event) => onSelectedResourceIdChange(event.target.value)}
              >
                <option value="">All resources</option>
                {filterResources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Status">
            {(props) => (
              <Select
                {...props}
                value={selectedStatus}
                onChange={(event) =>
                  onSelectedStatusChange(event.target.value as '' | ReservationStatus)
                }
              >
                <option value="">All statuses</option>
                <option value="Active">Active</option>
                <option value="Cancelled">Cancelled</option>
              </Select>
            )}
          </Field>
          <Button disabled={!hasActiveFilters} onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      )}
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {isLoading && <LoadingState>Loading reservations...</LoadingState>}
      {!isLoading && reservations.length === 0 && (
        <EmptyState title={emptyMessage} description={emptyDescription} />
      )}
      {reservations.length > 0 && (
        <ul className="item-list">
          {reservations.map((reservation) => {
            const isActive = reservation.status === 'Active'
            const period = formatDateTimeRange(reservation.startTime, reservation.endTime)

            return (
              <li key={reservation.id} className={isActive ? 'item' : 'item item-muted'}>
                <div className="item-main">
                  <p className="item-title">
                    <strong>{reservation.resourceName}</strong>
                    <Badge tone={isActive ? 'success' : 'neutral'}>{reservation.status}</Badge>
                  </p>
                  <dl className="item-meta">
                    <div>
                      <dt className="visually-hidden">Time</dt>
                      <dd>{period}</dd>
                    </div>
                    {showUser && (
                      <div>
                        <dt>Booked by</dt>
                        <dd>{reservation.userName} ({reservation.userEmail})</dd>
                      </div>
                    )}
                  </dl>
                </div>
                {isActive && (
                  <div className="item-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Cancel ${reservation.resourceName}, ${period}`}
                      disabled={cancellingReservationId === reservation.id}
                      onClick={() => onCancelReservation(reservation)}
                    >
                      {cancellingReservationId === reservation.id ? 'Cancelling...' : 'Cancel'}
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
