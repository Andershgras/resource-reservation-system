import type {
  BookableSlotResponse,
  ResourceResponse,
  ResourceScheduleResponse,
} from '../api/types'
import { formatTimeRange } from '../lib/dates'
import { getSlotKey, groupScheduleByDay } from '../lib/schedule'
import { Alert, type Notice } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Field, Input } from '../ui/Field'
import { EmptyState, LoadingState } from '../ui/States'
import './lists.css'
import './ResourceBookingSection.css'

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
  reservationNotice: Notice | null
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
  reservationNotice,
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
    <div className="booking-layout">
      <Card
        title="Book a resource"
        description="Choose what you want to book."
        actions={<Badge label={`${activeResources.length} resources`}>{activeResources.length}</Badge>}
      >
        {isLoadingResources && <LoadingState>Loading resources...</LoadingState>}
        {resourceMessage && <Alert tone="danger">{resourceMessage}</Alert>}
        {!isLoadingResources && activeResources.length === 0 && (
          <EmptyState title="No active resources found." />
        )}
        {activeResources.length > 0 && (
          <ul className="item-list">
            {activeResources.map((resource) => {
              const isSelected = selectedScheduleResourceId === resource.id.toString()

              return (
                <li
                  key={resource.id}
                  className={isSelected ? 'item booking-resource-selected' : 'item'}
                  aria-current={isSelected || undefined}
                >
                  <div className="item-main">
                    <p className="item-title">
                      <strong>{resource.name}</strong>
                      {isSelected && <Badge tone="primary">Selected</Badge>}
                    </p>
                    {resource.location && <p className="item-meta">{resource.location}</p>}
                    {resource.description && <p className="item-meta">{resource.description}</p>}
                  </div>
                  <div className="item-actions">
                    <Button
                      size="sm"
                      variant={isSelected ? 'secondary' : 'primary'}
                      aria-label={`View availability for ${resource.name}`}
                      disabled={isLoadingResourceSchedule && isSelected}
                      onClick={() => onSelectResourceForSchedule(resource)}
                    >
                      View availability
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card
        title="Resource schedule"
        description="Times are Copenhagen time."
        actions={resourceSchedule && (
          <Badge label={`${resourceSchedule.bookableSlots.length} bookable times`}>
            {resourceSchedule.bookableSlots.length}
          </Badge>
        )}
      >
        <div className="list-filters" role="group" aria-label="Schedule date range">
          <Field label="From">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={scheduleFromDate}
                onChange={(event) => setScheduleFromDate(event.target.value)}
              />
            )}
          </Field>
          <Field label="To">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={scheduleToDate}
                onChange={(event) => setScheduleToDate(event.target.value)}
              />
            )}
          </Field>
          <Button
            disabled={!selectedScheduleResourceId || isLoadingResourceSchedule}
            onClick={onLoadResourceSchedule}
          >
            {isLoadingResourceSchedule ? 'Loading...' : 'Update schedule'}
          </Button>
        </div>

        {resourceScheduleMessage && <Alert tone="danger">{resourceScheduleMessage}</Alert>}
        {reservationNotice && <Alert tone={reservationNotice.tone}>{reservationNotice.text}</Alert>}
        {reservationValidationMessage && <Alert tone="danger">{reservationValidationMessage}</Alert>}
        {!selectedScheduleResourceId && (
          <EmptyState title="Choose a resource to see bookable times." />
        )}
        {isLoadingResourceSchedule && <LoadingState>Loading resource schedule...</LoadingState>}
        {resourceSchedule &&
          !isLoadingResourceSchedule &&
          resourceSchedule.bookableSlots.length === 0 && (
            <EmptyState
              title="No bookable times found."
              description="Try another date range."
            />
          )}
        {resourceSchedule && resourceSchedule.bookableSlots.length > 0 && (
          <>
            <p className="booking-selected">
              <span>Selected resource</span>
              <strong>{resourceSchedule.resourceName}</strong>
            </p>
            <div className="schedule-day-grid" role="group" aria-label="Bookable schedule">
              {scheduleDays.map((day) => (
                <section
                  key={day.date}
                  className="schedule-day"
                  aria-labelledby={`schedule-day-${day.date}`}
                >
                  <div className="schedule-day-heading">
                    <h3 id={`schedule-day-${day.date}`}>{day.label}</h3>
                    <Badge tone="success">{day.bookableSlots.length} open</Badge>
                  </div>

                  {day.reservedSlots.length > 0 && (
                    <ul className="reserved-slots" aria-label="Reserved times">
                      {day.reservedSlots.map((slot) => (
                        <li key={`${slot.startTime}-${slot.endTime}`}>
                          Reserved {formatTimeRange(slot.startTime, slot.endTime)}
                        </li>
                      ))}
                    </ul>
                  )}

                  <ul className="schedule-slot-list">
                    {day.bookableSlots.map((slot) => {
                      const slotKey = getSlotKey(slot)
                      const isSelectingSlot = selectedScheduleSlotKey === slotKey
                      const slotTimes = formatTimeRange(slot.startTime, slot.endTime)

                      return (
                        <li key={slotKey} className="schedule-slot">
                          <strong>{slotTimes}</strong>
                          {isSelectingSlot ? (
                            <div className="reservation-time-form">
                              <Field label="Start">
                                {(props) => (
                                  <Input
                                    {...props}
                                    type="datetime-local"
                                    min={formatDateTimeInput(slot.startTime)}
                                    max={formatDateTimeInput(slot.endTime)}
                                    value={reservationStartTime}
                                    onChange={(event) => setReservationStartTime(event.target.value)}
                                  />
                                )}
                              </Field>
                              <Field label="End">
                                {(props) => (
                                  <Input
                                    {...props}
                                    type="datetime-local"
                                    min={formatDateTimeInput(slot.startTime)}
                                    max={formatDateTimeInput(slot.endTime)}
                                    value={reservationEndTime}
                                    onChange={(event) => setReservationEndTime(event.target.value)}
                                  />
                                )}
                              </Field>
                              <div className="reservation-time-actions">
                                <Button size="sm" variant="ghost" onClick={onCancelScheduleSlotSelection}>
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={reservingScheduleSlotKey === slotKey}
                                  onClick={() => onReserveScheduleSlot(slot)}
                                >
                                  {reservingScheduleSlotKey === slotKey ? 'Reserving...' : 'Reserve'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              aria-label={`Choose time ${day.label} ${slotTimes}`}
                              disabled={reservingScheduleSlotKey === slotKey}
                              onClick={() => onSelectScheduleSlot(slot)}
                            >
                              Choose time
                            </Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
