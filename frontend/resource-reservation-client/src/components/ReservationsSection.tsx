import type {
  ReservationResponse,
  ReservationStatus,
  ResourceResponse,
} from '../api/types'

interface ReservationsSectionProps {
  title: string
  reservations: ReservationResponse[]
  isLoading: boolean
  message: string
  showUserId?: boolean
  filterResources?: ResourceResponse[]
  selectedResourceId?: string
  selectedStatus?: '' | ReservationStatus
  onSelectedResourceIdChange?: (resourceId: string) => void
  onSelectedStatusChange?: (status: '' | ReservationStatus) => void
  onClearFilters?: () => void
  emptyMessage?: string
  cancellingReservationId: number | null
  onCancelReservation: (reservation: ReservationResponse) => void
  formatDateTime: (value: string) => string
}

export function ReservationsSection({
  title,
  reservations,
  isLoading,
  message,
  showUserId = false,
  filterResources,
  selectedResourceId = '',
  selectedStatus = '',
  onSelectedResourceIdChange,
  onSelectedStatusChange,
  onClearFilters,
  emptyMessage = 'No reservations found.',
  cancellingReservationId,
  onCancelReservation,
  formatDateTime,
}: ReservationsSectionProps) {
  const titleId = title.toLowerCase().replaceAll(' ', '-') + '-title'
  const showFilters =
    filterResources &&
    onSelectedResourceIdChange &&
    onSelectedStatusChange &&
    onClearFilters
  const hasActiveFilters = selectedResourceId !== '' || selectedStatus !== ''

  return (
    <section className="panel-section" aria-labelledby={titleId}>
      <div className="section-heading">
        <h2 id={titleId}>{title}</h2>
        <span className="count-badge">{reservations.length}</span>
      </div>
      {showFilters && (
        <div className="reservation-filters" aria-label="Reservation filters">
          <label>
            <span className="label-text">Resource</span>
            <select
              value={selectedResourceId}
              onChange={(event) =>
                onSelectedResourceIdChange(event.target.value)
              }
            >
              <option value="">All resources</option>
              {filterResources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label-text">Status</span>
            <select
              value={selectedStatus}
              onChange={(event) =>
                onSelectedStatusChange(
                  event.target.value as '' | ReservationStatus,
                )
              }
            >
              <option value="">All statuses</option>
              <option value="Active">Active</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!hasActiveFilters}
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        </div>
      )}
      {isLoading && (
        <p className="status-message" role="status">
          Loading reservations...
        </p>
      )}
      {message && <p className="status-message">{message}</p>}
      {!isLoading && reservations.length === 0 && (
        <p className="status-message">{emptyMessage}</p>
      )}
      {reservations.length > 0 && (
        <ul className="resource-list">
          {reservations.map((reservation) => (
            <li
              key={reservation.id}
              className={`reservation-item reservation-item-${reservation.status.toLowerCase()}`}
            >
              <div className="item-main">
                <strong>{reservation.resourceName}</strong>
                {showUserId && <p>User ID: {reservation.userId}</p>}
                <div className="reservation-dates">
                  <p>
                    <span>Start</span>
                    {formatDateTime(reservation.startTime)}
                  </p>
                  <p>
                    <span>End</span>
                    {formatDateTime(reservation.endTime)}
                  </p>
                </div>
              </div>
              <div className="resource-actions">
                <span
                  className={`reservation-status reservation-status-${reservation.status.toLowerCase()}`}
                >
                  {reservation.status}
                </span>
                {reservation.status === 'Active' && (
                  <button
                    type="button"
                    disabled={cancellingReservationId === reservation.id}
                    onClick={() => onCancelReservation(reservation)}
                  >
                    {cancellingReservationId === reservation.id
                      ? 'Cancelling...'
                      : 'Cancel'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
