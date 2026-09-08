import type { Dispatch, SetStateAction } from 'react'
import type { AvailabilityResponse, UserRole } from '../api/types'

interface AvailabilitySectionProps {
  currentUserRole: UserRole
  availabilities: AvailabilityResponse[]
  isLoadingAvailabilities: boolean
  availabilityMessage: string
  reservationMessage: string
  reservationValidationMessage?: string
  reservingAvailabilityId: number | null
  selectedReservationAvailabilityId?: number | null
  reservationStartTime?: string
  setReservationStartTime?: Dispatch<SetStateAction<string>>
  reservationEndTime?: string
  setReservationEndTime?: Dispatch<SetStateAction<string>>
  deletingAvailabilityId: number | null
  onReserve: (availability: AvailabilityResponse) => void
  onSelectAvailabilityForReservation?: (
    availability: AvailabilityResponse,
  ) => void
  onCancelReservationTimeSelection?: () => void
  onEditAvailability: (availability: AvailabilityResponse) => void
  onDeleteAvailability: (availability: AvailabilityResponse) => void
  formatDateTime: (value: string) => string
  formatDateTimeInput?: (value: string) => string
}

export function AvailabilitySection({
  currentUserRole,
  availabilities,
  isLoadingAvailabilities,
  availabilityMessage,
  reservationMessage,
  reservationValidationMessage = '',
  reservingAvailabilityId,
  selectedReservationAvailabilityId = null,
  reservationStartTime = '',
  setReservationStartTime,
  reservationEndTime = '',
  setReservationEndTime,
  deletingAvailabilityId,
  onReserve,
  onSelectAvailabilityForReservation,
  onCancelReservationTimeSelection,
  onEditAvailability,
  onDeleteAvailability,
  formatDateTime,
  formatDateTimeInput,
}: AvailabilitySectionProps) {
  return (
    <section className="placeholder-section" aria-labelledby="availabilities-title">
      <h2 id="availabilities-title">Availability</h2>
      {reservationMessage && <p className="status-message">{reservationMessage}</p>}
      {reservationValidationMessage && (
        <p className="status-message" role="alert">
          {reservationValidationMessage}
        </p>
      )}
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
            const isSelectingReservationTime =
              selectedReservationAvailabilityId === availability.id
            const canSelectReservationTime =
              onSelectAvailabilityForReservation &&
              onCancelReservationTimeSelection &&
              setReservationStartTime &&
              setReservationEndTime &&
              formatDateTimeInput

            return (
              <li key={availability.id}>
                <div>
                  <strong>{availability.resourceName}</strong>
                  <div className="availability-dates">
                    <p>
                      <span>Start</span>
                      {formatDateTime(availability.startTime)}
                    </p>
                    <p>
                      <span>End</span>
                      {formatDateTime(availability.endTime)}
                    </p>
                  </div>
                </div>
                {currentUserRole === 'User' && (
                  <div className="resource-actions">
                    {isSelectingReservationTime && canSelectReservationTime ? (
                      <div className="reservation-time-form">
                        <label>
                          <span className="label-text">Start</span>
                          <input
                            type="datetime-local"
                            min={formatDateTimeInput(availability.startTime)}
                            max={formatDateTimeInput(availability.endTime)}
                            value={reservationStartTime}
                            onChange={(event) =>
                              setReservationStartTime(event.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span className="label-text">End</span>
                          <input
                            type="datetime-local"
                            min={formatDateTimeInput(availability.startTime)}
                            max={formatDateTimeInput(availability.endTime)}
                            value={reservationEndTime}
                            onChange={(event) =>
                              setReservationEndTime(event.target.value)
                            }
                          />
                        </label>
                        <div className="reservation-time-actions">
                          <button
                            type="button"
                            onClick={onCancelReservationTimeSelection}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={reservingAvailabilityId === availability.id}
                            onClick={() => onReserve(availability)}
                          >
                            {reservingAvailabilityId === availability.id
                              ? 'Reserving...'
                              : 'Reserve'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={reservingAvailabilityId === availability.id}
                        onClick={() =>
                          onSelectAvailabilityForReservation?.(availability)
                        }
                      >
                        Choose time
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
