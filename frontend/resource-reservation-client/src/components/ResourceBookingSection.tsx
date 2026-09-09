import type {
  BookableSlotResponse,
  ResourceResponse,
  ResourceScheduleResponse,
} from '../api/types'

interface ResourceBookingSectionProps {
  resources: ResourceResponse[]
  resourceMessage: string
  isLoadingResources: boolean
  selectedScheduleResourceId: string
  scheduleFromDate: string
  setScheduleFromDate: (value: string) => void
  scheduleToDate: string
  setScheduleToDate: (value: string) => void
  resourceSchedule: ResourceScheduleResponse | null
  resourceScheduleMessage: string
  reservationMessage: string
  reservationValidationMessage: string
  isLoadingResourceSchedule: boolean
  selectedScheduleSlotKey: string | null
  reservingScheduleSlotKey: string | null
  reservationStartTime: string
  setReservationStartTime: (value: string) => void
  reservationEndTime: string
  setReservationEndTime: (value: string) => void
  onSelectResourceForSchedule: (resource: ResourceResponse) => void
  onLoadResourceSchedule: () => void
  onSelectScheduleSlot: (slot: BookableSlotResponse) => void
  onCancelScheduleSlotSelection: () => void
  onReserveScheduleSlot: (slot: BookableSlotResponse) => void
  formatDateTime: (value: string) => string
  formatDateTimeInput: (value: string) => string
}

export function ResourceBookingSection({
  resources,
  resourceMessage,
  isLoadingResources,
  selectedScheduleResourceId,
  scheduleFromDate,
  setScheduleFromDate,
  scheduleToDate,
  setScheduleToDate,
  resourceSchedule,
  resourceScheduleMessage,
  reservationMessage,
  reservationValidationMessage,
  isLoadingResourceSchedule,
  selectedScheduleSlotKey,
  reservingScheduleSlotKey,
  reservationStartTime,
  setReservationStartTime,
  reservationEndTime,
  setReservationEndTime,
  onSelectResourceForSchedule,
  onLoadResourceSchedule,
  onSelectScheduleSlot,
  onCancelScheduleSlotSelection,
  onReserveScheduleSlot,
  formatDateTime,
  formatDateTimeInput,
}: ResourceBookingSectionProps) {
  const activeResources = resources.filter((resource) => resource.isActive)

  return (
    <>
      <section className="panel-section" aria-labelledby="book-resource-title">
        <div className="section-heading">
          <h2 id="book-resource-title">Book a resource</h2>
          <span className="count-badge">{activeResources.length}</span>
        </div>
        {isLoadingResources && (
          <p className="status-message" role="status">
            Loading resources...
          </p>
        )}
        {resourceMessage && <p className="status-message">{resourceMessage}</p>}
        {!isLoadingResources && activeResources.length === 0 && (
          <p className="status-message">No active resources found.</p>
        )}
        {activeResources.length > 0 && (
          <ul className="resource-list">
            {activeResources.map((resource) => (
              <li key={resource.id} className="resource-item">
                <div className="item-main">
                  <strong>{resource.name}</strong>
                  {resource.location && <p>{resource.location}</p>}
                  {resource.description && <p>{resource.description}</p>}
                </div>
                <div className="resource-actions">
                  <button
                    type="button"
                    disabled={
                      isLoadingResourceSchedule &&
                      selectedScheduleResourceId === resource.id.toString()
                    }
                    onClick={() => onSelectResourceForSchedule(resource)}
                  >
                    {selectedScheduleResourceId === resource.id.toString()
                      ? 'View availability'
                      : 'View availability'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-section" aria-labelledby="resource-schedule-title">
        <div className="section-heading">
          <h2 id="resource-schedule-title">Resource schedule</h2>
          {resourceSchedule && (
            <span className="count-badge">
              {resourceSchedule.bookableSlots.length}
            </span>
          )}
        </div>

        <div className="schedule-controls" aria-label="Schedule date range">
          <label>
            <span className="label-text">From</span>
            <input
              type="date"
              value={scheduleFromDate}
              onChange={(event) => setScheduleFromDate(event.target.value)}
            />
          </label>
          <label>
            <span className="label-text">To</span>
            <input
              type="date"
              value={scheduleToDate}
              onChange={(event) => setScheduleToDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!selectedScheduleResourceId || isLoadingResourceSchedule}
            onClick={onLoadResourceSchedule}
          >
            {isLoadingResourceSchedule ? 'Loading...' : 'Update schedule'}
          </button>
        </div>

        {resourceScheduleMessage && (
          <p className="status-message">{resourceScheduleMessage}</p>
        )}
        {reservationMessage && (
          <p className="status-message">{reservationMessage}</p>
        )}
        {reservationValidationMessage && (
          <p className="status-message" role="alert">
            {reservationValidationMessage}
          </p>
        )}
        {!selectedScheduleResourceId && (
          <p className="status-message">Choose a resource to see bookable times.</p>
        )}
        {isLoadingResourceSchedule && (
          <p className="status-message" role="status">
            Loading resource schedule...
          </p>
        )}
        {resourceSchedule &&
          !isLoadingResourceSchedule &&
          resourceSchedule.bookableSlots.length === 0 && (
            <p className="status-message">No bookable times found.</p>
          )}
        {resourceSchedule && resourceSchedule.bookableSlots.length > 0 && (
          <>
            <div className="selected-resource-heading">
              <span className="label-text">Selected resource</span>
              <strong>{resourceSchedule.resourceName}</strong>
            </div>
            <ul className="resource-list">
              {resourceSchedule.bookableSlots.map((slot) => {
                const slotKey = getSlotKey(slot)
                const isSelectingSlot = selectedScheduleSlotKey === slotKey

                return (
                  <li key={slotKey} className="resource-item">
                    <div className="item-main">
                      <strong>{formatDateTime(slot.startTime)}</strong>
                      <div className="availability-dates">
                        <p>
                          <span>Until</span>
                          {formatDateTime(slot.endTime)}
                        </p>
                      </div>
                    </div>
                    <div className="resource-actions">
                      {isSelectingSlot ? (
                        <div className="reservation-time-form">
                          <label>
                            <span className="label-text">Start</span>
                            <input
                              type="datetime-local"
                              min={formatDateTimeInput(slot.startTime)}
                              max={formatDateTimeInput(slot.endTime)}
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
                              min={formatDateTimeInput(slot.startTime)}
                              max={formatDateTimeInput(slot.endTime)}
                              value={reservationEndTime}
                              onChange={(event) =>
                                setReservationEndTime(event.target.value)
                              }
                            />
                          </label>
                          <div className="reservation-time-actions">
                            <button
                              type="button"
                              onClick={onCancelScheduleSlotSelection}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={reservingScheduleSlotKey === slotKey}
                              onClick={() => onReserveScheduleSlot(slot)}
                            >
                              {reservingScheduleSlotKey === slotKey
                                ? 'Reserving...'
                                : 'Reserve'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={reservingScheduleSlotKey === slotKey}
                          onClick={() => onSelectScheduleSlot(slot)}
                        >
                          Choose time
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>
    </>
  )
}

function getSlotKey(slot: BookableSlotResponse) {
  return `${slot.startTime}-${slot.endTime}`
}
