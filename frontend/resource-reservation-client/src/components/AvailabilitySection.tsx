import type {
  AvailabilityResponse,
  ReservationResponse,
  UserRole,
} from '../api/types'

interface AvailabilitySectionProps {
  currentUserRole: UserRole
  availabilities: AvailabilityResponse[]
  reservations: ReservationResponse[]
  isLoadingAvailabilities: boolean
  availabilityMessage: string
  reservationMessage: string
  reservingAvailabilityId: number | null
  deletingAvailabilityId: number | null
  onReserve: (availability: AvailabilityResponse) => void
  onEditAvailability: (availability: AvailabilityResponse) => void
  onDeleteAvailability: (availability: AvailabilityResponse) => void
  formatDateTime: (value: string) => string
  hasActiveReservationOverlap: (
    availability: AvailabilityResponse,
    reservations: ReservationResponse[],
  ) => boolean
}

export function AvailabilitySection({
  currentUserRole,
  availabilities,
  reservations,
  isLoadingAvailabilities,
  availabilityMessage,
  reservationMessage,
  reservingAvailabilityId,
  deletingAvailabilityId,
  onReserve,
  onEditAvailability,
  onDeleteAvailability,
  formatDateTime,
  hasActiveReservationOverlap,
}: AvailabilitySectionProps) {
  return (
    <section className="placeholder-section" aria-labelledby="availabilities-title">
      <h2 id="availabilities-title">Availability</h2>
      {reservationMessage && <p className="status-message">{reservationMessage}</p>}
      {isLoadingAvailabilities && (
        <p className="status-message" role="status">
          Loading availability...
        </p>
      )}
      {availabilityMessage && (
        <p className="status-message">{availabilityMessage}</p>
      )}
      {!isLoadingAvailabilities &&
        availabilities.length === 0 && (
          <p className="status-message">No availability found.</p>
        )}
      {availabilities.length > 0 && (
        <ul className="resource-list">
          {availabilities.map((availability) => {
            const isReservedByUser =
              currentUserRole === 'User' &&
              hasActiveReservationOverlap(availability, reservations)

            return (
              <li key={availability.id}>
                <div>
                  <strong>{availability.resourceName}</strong>
                  <p>{formatDateTime(availability.startTime)}</p>
                  <p>{formatDateTime(availability.endTime)}</p>
                </div>
                {currentUserRole === 'User' && (
                  <div className="resource-actions">
                    {isReservedByUser ? (
                      <span>Reserved</span>
                    ) : (
                      <button
                        type="button"
                        disabled={reservingAvailabilityId === availability.id}
                        onClick={() => onReserve(availability)}
                      >
                        {reservingAvailabilityId === availability.id
                          ? 'Reserving...'
                          : 'Reserve'}
                      </button>
                    )}
                  </div>
                )}
                {currentUserRole === 'Admin' && (
                  <div className="resource-actions">
                    <button
                      type="button"
                      onClick={() => onEditAvailability(availability)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deletingAvailabilityId === availability.id}
                      onClick={() => onDeleteAvailability(availability)}
                    >
                      {deletingAvailabilityId === availability.id
                        ? 'Deleting...'
                        : 'Delete'}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
