import type { ReservationResponse } from '../api/types'

interface ReservationsSectionProps {
  title: string
  reservations: ReservationResponse[]
  isLoading: boolean
  message: string
  showUserId?: boolean
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
  cancellingReservationId,
  onCancelReservation,
  formatDateTime,
}: ReservationsSectionProps) {
  const titleId = title.toLowerCase().replaceAll(' ', '-') + '-title'

  return (
    <section className="placeholder-section" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      {isLoading && <p>Loading reservations...</p>}
      {message && <p className="status-message">{message}</p>}
      {!isLoading && !message && reservations.length === 0 && (
        <p>No reservations found.</p>
      )}
      {reservations.length > 0 && (
        <ul className="resource-list">
          {reservations.map((reservation) => (
            <li key={reservation.id}>
              <div>
                <strong>{reservation.resourceName}</strong>
                {showUserId && <p>User ID: {reservation.userId}</p>}
                <p>{formatDateTime(reservation.startTime)}</p>
                <p>{formatDateTime(reservation.endTime)}</p>
              </div>
              <div className="resource-actions">
                <span>{reservation.status}</span>
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
