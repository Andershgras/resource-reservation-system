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
  formatDateTimeInput,
}: ResourceBookingSectionProps) {
  const activeResources = resources.filter((resource) => resource.isActive)
  const scheduleDays = resourceSchedule
    ? groupScheduleByDay(resourceSchedule)
    : []

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
            <div className="schedule-day-grid" aria-label="Bookable schedule">
              {scheduleDays.map((day) => (
                <section
                  key={day.date}
                  className="schedule-day"
                  aria-labelledby={`schedule-day-${day.date}`}
                >
                  <div className="schedule-day-heading">
                    <h3 id={`schedule-day-${day.date}`}>{day.label}</h3>
                    <span>{day.bookableSlots.length} open</span>
                  </div>

                  {day.reservedSlots.length > 0 && (
                    <div className="reserved-slots" aria-label="Reserved times">
                      {day.reservedSlots.map((slot) => (
                        <span key={`${slot.reservationId}-${slot.startTime}`}>
                          Reserved {formatClockTime(slot.startTime)}-{formatClockTime(slot.endTime)}
                        </span>
                      ))}
                    </div>
                  )}

                  <ul className="schedule-slot-list">
                    {day.bookableSlots.map((slot) => {
                      const slotKey = getSlotKey(slot)
                      const isSelectingSlot = selectedScheduleSlotKey === slotKey

                      return (
                        <li key={slotKey} className="schedule-slot">
                          <div className="item-main">
                            <strong>
                              {formatClockTime(slot.startTime)}-{formatClockTime(slot.endTime)}
                            </strong>
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
                </section>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  )
}

function getSlotKey(slot: BookableSlotResponse) {
  return `${slot.startTime}-${slot.endTime}`
}

function groupScheduleByDay(resourceSchedule: ResourceScheduleResponse) {
  const slotsByDate = new Map<string, BookableSlotResponse[]>()
  const reservedSlotsByDate = new Map<string, ResourceScheduleResponse['reservedSlots']>()

  for (const slot of resourceSchedule.bookableSlots) {
    const date = getDateKey(slot.startTime)
    slotsByDate.set(date, [...(slotsByDate.get(date) ?? []), slot])
  }

  for (const slot of resourceSchedule.reservedSlots) {
    const date = getDateKey(slot.startTime)
    reservedSlotsByDate.set(date, [...(reservedSlotsByDate.get(date) ?? []), slot])
  }

  return [...slotsByDate.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([date, slots]) => ({
      date,
      label: formatDateHeading(date),
      bookableSlots: slots.sort((firstSlot, secondSlot) =>
        firstSlot.startTime.localeCompare(secondSlot.startTime),
      ),
      reservedSlots: (reservedSlotsByDate.get(date) ?? []).sort(
        (firstSlot, secondSlot) =>
          firstSlot.startTime.localeCompare(secondSlot.startTime),
      ),
    }))
}

function getDateKey(value: string) {
  return value.slice(0, 10)
}

function formatDateHeading(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatClockTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}
