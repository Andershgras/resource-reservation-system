import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ApiError } from '../../api/client'
import type { ReservationResponse } from '../../api/types'
import { useUnsavedChangesGuard } from '../../components/useUnsavedChangesGuard'
import {
  buildCalendarWeek,
  defaultEndTime,
  durationLimitsFor,
  endOptions,
  isWithinInterval,
  startOfWeek,
  startOptions,
  visibleHours,
  type CalendarSegment,
} from '../../lib/calendar'
import { describeBookingRules } from '../../lib/bookingRules'
import {
  addDaysToDateKey,
  formatDate,
  formatDateTimeRange,
  nowInSchedulingZone,
  todayInSchedulingZone,
} from '../../lib/dates'
import { getErrorMessage, getFormErrors, type FieldErrors } from '../../lib/errors'
import { Alert, type Notice } from '../../ui/Alert'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Field, Input } from '../../ui/Field'
import { EmptyState, LoadingState } from '../../ui/States'
import { useMediaQuery } from '../../ui/useMediaQuery'
import {
  useCreateReservation,
  useRescheduleReservation,
  useReservation,
} from '../reservations/reservationQueries'
import { useResources } from '../resources/resourceQueries'
import { BookingCalendar } from './BookingCalendar'
import { BookingPanel, type BookingField } from './BookingPanel'
import { useResourceSchedule } from './bookingQueries'
import { bookingSelectionFor, toBookingSearch, type BookingSelection } from './bookingSearch'
import { MoveBookingCard } from './MoveBookingCard'
import '../../components/lists.css'
import './BookingPage.css'

const bookingFields: readonly BookingField[] = ['startTime', 'endTime']

interface Draft {
  segment: CalendarSegment
  startTime: string
  endTime: string
  // The times the panel opened with, to tell whether the user changed them.
  suggestedStartTime: string
  suggestedEndTime: string
}

// A notice and the address it belongs to. It disappears when the address
// changes, except that a booking that was moved can announce it at the
// address the page goes to afterwards.
interface ShownNotice {
  selectionKey: string
  notice: Notice
}

// /book: choose a resource, then a free time in its weekly calendar.
// /book?…&move=42 moves an existing booking: the same calendar, with that
// booking's own time shown as free.
export function BookingPage() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const resourcesQuery = useResources()
  const activeResources = (resourcesQuery.data ?? []).filter((resource) => resource.isActive)
  const selection = bookingSelectionFor(search, resourcesQuery.data)
  const scheduleQuery = useResourceSchedule(selection, { live: true })
  const createReservation = useCreateReservation()
  const rescheduleReservation = useRescheduleReservation()
  const isMoving = selection.moveReservationId !== null
  const reservationQuery = useReservation(selection.moveReservationId)
  const movingReservation = isMoving ? reservationQuery.data : undefined
  // Judged once the resources are known, since the selection needs them.
  const moveProblem = movingReservation && resourcesQuery.data
    ? describeMoveProblem(movingReservation, selection.resourceId)
    : null
  // While moving, the calendar waits until the booking is known to be movable.
  const canChoose = !isMoving || (movingReservation !== undefined && moveProblem === null)
  const today = todayInSchedulingZone()
  const thisWeek = startOfWeek(today)
  const schedule = selection.resourceId === null ? null : scheduleQuery.data ?? null
  const selectedResource = activeResources.find((resource) => resource.id === selection.resourceId)
  const days = useMemo(
    () => buildCalendarWeek(schedule, selection.weekStart, today),
    [schedule, selection.weekStart, today],
  )
  const { firstHour, lastHour } = visibleHours(days)
  const limits = durationLimitsFor(schedule?.policy)
  const noticeRef = useRef<HTMLDivElement>(null)
  // Matches the calendar's switch to a list of days (BookingCalendar.css).
  const isSmallScreen = useMediaQuery('(max-width: 760px)')
  // Set when a booking finishes, so focus moves to its result once it shows.
  const focusNoticeRef = useRef(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [shownNotice, setShownNotice] = useState<ShownNotice | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<BookingField>>({})
  const [formError, setFormError] = useState('')

  // When the address changes, including through the back button, a time
  // being chosen for another week or resource is dropped.
  const selectionKey = toBookingSearch(selection)
  const [shownSelectionKey, setShownSelectionKey] = useState(selectionKey)
  const notice = shownNotice?.selectionKey === selectionKey ? shownNotice.notice : null

  function showNotice(next: Notice, forSelectionKey = selectionKey) {
    setShownNotice({ selectionKey: forSelectionKey, notice: next })
  }

  useEffect(() => {
    if (notice && focusNoticeRef.current) {
      focusNoticeRef.current = false
      noticeRef.current?.focus()
    }
  }, [notice])

  useUnsavedChangesGuard(
    draft !== null &&
      (draft.startTime !== draft.suggestedStartTime || draft.endTime !== draft.suggestedEndTime),
  )

  function closeDraft() {
    setDraft(null)
    setFieldErrors({})
    setFormError('')
  }

  if (shownSelectionKey !== selectionKey) {
    setShownSelectionKey(selectionKey)
    closeDraft()
  }

  // The selection last navigated to, until the address change renders. Two
  // quick changes, such as a resource and then a date, build on each other
  // instead of the second one starting from the stale selection.
  const pendingSelectionRef = useRef<BookingSelection | null>(null)

  useEffect(() => {
    pendingSelectionRef.current = null
  }, [selectionKey])

  function changeSelection(change: (current: BookingSelection) => BookingSelection) {
    const next = change(pendingSelectionRef.current ?? selection)

    pendingSelectionRef.current = next
    navigate({ search: toBookingSearch(next) })
  }

  function showWeek(weekStart: string) {
    changeSelection((current) => ({ ...current, weekStart }))
  }

  function handleSelectSegment(segment: CalendarSegment) {
    const starts = startOptions(segment.interval, limits)
    // The day the user clicked, for a period that continues past midnight.
    const startTime = starts.find((option) => option.value >= segment.start)?.value ?? starts[0]?.value ?? ''
    const endTime = defaultEndTime(segment.interval, startTime, limits)

    setShownNotice(null)
    setFieldErrors({})
    setFormError('')
    setDraft({ segment, startTime, endTime, suggestedStartTime: startTime, suggestedEndTime: endTime })
  }

  function handleStartTimeChange(startTime: string) {
    setDraft((current) => {
      if (!current) {
        return current
      }

      const ends = endOptions(current.segment.interval, startTime, limits)
      const endTime = ends.some((option) => option.value === current.endTime)
        ? current.endTime
        : defaultEndTime(current.segment.interval, startTime, limits)

      return { ...current, startTime, endTime }
    })
  }

  async function handleReserve() {
    if (!draft || selection.resourceId === null) {
      return
    }

    setFieldErrors({})
    setFormError('')

    if (!isWithinInterval(draft.segment.interval, draft.startTime, draft.endTime)) {
      setFormError('Choose a start and end inside the free time.')
      return
    }

    const period = formatDateTimeRange(draft.startTime, draft.endTime)

    try {
      // Each resolves once the reservation lists and the calendar have reloaded.
      if (movingReservation) {
        await rescheduleReservation.mutateAsync({
          id: movingReservation.id,
          request: { startTime: draft.startTime, endTime: draft.endTime, version: movingReservation.version },
        })
        // Back to ordinary booking, in the same week, with the moved booking
        // now shown as reserved. The path stays the same, so nothing blocks it.
        const afterMove = toBookingSearch({ ...selection, moveReservationId: null })
        closeDraft()
        focusNoticeRef.current = true
        showNotice({ tone: 'success', text: `Booking moved to ${period}.` }, afterMove)
        navigate({ search: afterMove })
        return
      }

      await createReservation.mutateAsync({
        resourceId: selection.resourceId,
        startTime: draft.startTime,
        endTime: draft.endTime,
      })
      closeDraft()
      focusNoticeRef.current = true
      showNotice({ tone: 'success', text: `Reservation created: ${period}.` })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Someone else booked the time first, or changed the booking being
        // moved: show the calendar and the booking as they are now.
        closeDraft()
        focusNoticeRef.current = true
        showNotice({ tone: 'danger', text: `${error.message} The calendar has been updated.` })
        void scheduleQuery.refetch()
        return
      }

      const formErrors = getFormErrors(error, bookingFields)
      setFieldErrors(formErrors.fieldErrors)
      setFormError(formErrors.message)
    }
  }

  const bookingPanel = draft && selectedResource && (
    <BookingPanel
      resourceName={selectedResource.name}
      mode={isMoving ? 'move' : 'book'}
      interval={draft.segment.interval}
      limits={limits}
      startTime={draft.startTime}
      endTime={draft.endTime}
      onStartTimeChange={handleStartTimeChange}
      onEndTimeChange={(endTime) => setDraft((current) => current && { ...current, endTime })}
      fieldErrors={fieldErrors}
      formError={formError}
      isReserving={createReservation.isPending || rescheduleReservation.isPending}
      onReserve={() => void handleReserve()}
      onCancel={closeDraft}
    />
  )
  const weekEnd = addDaysToDateKey(selection.weekStart, 6)
  const hasFreeTime = days.some((day) => day.status === 'open')

  return (
    <div className="booking-layout">
      {isMoving ? (
        <MoveBookingCard
          reservation={reservationQuery.data}
          isLoading={reservationQuery.isPending}
          error={reservationQuery.error}
          problem={moveProblem}
        />
      ) : (
        <Card
          title="Book a resource"
          description="Choose what you want to book."
          actions={<Badge label={`${activeResources.length} resources`}>{activeResources.length}</Badge>}
        >
          {resourcesQuery.isPending && <LoadingState>Loading resources...</LoadingState>}
          {resourcesQuery.error && <Alert tone="danger">{getErrorMessage(resourcesQuery.error)}</Alert>}
          {!resourcesQuery.isPending && activeResources.length === 0 && (
            <EmptyState title="No active resources found." />
          )}
          {activeResources.length > 0 && (
            <ul className="item-list booking-resources">
              {activeResources.map((resource) => {
                const isSelected = resource.id === selection.resourceId

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
                    </div>
                    <div className="item-actions">
                      <Button
                        size="sm"
                        variant={isSelected ? 'secondary' : 'primary'}
                        aria-label={`View availability for ${resource.name}`}
                        onClick={() => changeSelection((current) => ({ ...current, resourceId: resource.id }))}
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
      )}

      <Card
        title="Resource schedule"
        description={selectedResource
          ? `${selectedResource.name}. Times are Copenhagen time.`
          : 'Times are Copenhagen time.'}
      >
        <div className="booking-week-bar">
          <p className="booking-week-label" aria-live="polite">
            <span className="visually-hidden">Showing the week </span>
            {formatDate(selection.weekStart)} – {formatDate(weekEnd)}
          </p>
          <div className="booking-week-actions" role="group" aria-label="Choose week">
            <Button
              size="sm"
              disabled={selection.weekStart <= thisWeek}
              onClick={() => changeSelection((current) => ({
                ...current,
                weekStart: addDaysToDateKey(current.weekStart, -7),
              }))}
            >
              Previous week
            </Button>
            <Button size="sm" disabled={selection.weekStart === thisWeek} onClick={() => showWeek(thisWeek)}>
              This week
            </Button>
            <Button size="sm" onClick={() => changeSelection((current) => ({
                ...current,
                weekStart: addDaysToDateKey(current.weekStart, 7),
              }))}>
              Next week
            </Button>
          </div>
          <Field label="Go to date" className="booking-week-date">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={selection.weekStart}
                onChange={(event) => {
                  if (event.target.value) {
                    showWeek(startOfWeek(event.target.value))
                  }
                }}
              />
            )}
          </Field>
        </div>

        <div ref={noticeRef} tabIndex={-1} className="booking-notice">
          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        </div>

        {selection.resourceId === null && !isMoving && (
          <EmptyState title="Choose a resource to see bookable times." />
        )}
        {selection.resourceId !== null && scheduleQuery.error && (
          <Alert tone="danger" title="The schedule couldn't be loaded.">
            <p>{getErrorMessage(scheduleQuery.error)}</p>
            <Button size="sm" onClick={() => void scheduleQuery.refetch()}>Try again</Button>
          </Alert>
        )}
        {selection.resourceId !== null && scheduleQuery.isPending && (
          <LoadingState>Loading resource schedule...</LoadingState>
        )}
        {schedule && canChoose && (
          <>
            <p className="booking-rules">{describeBookingRules(schedule.policy)}</p>
            {!hasFreeTime && (
              <Alert tone="info" title="No bookable times found this week.">
                Try the next week, or another resource.
              </Alert>
            )}
            <BookingCalendar
              days={days}
              firstHour={firstHour}
              lastHour={lastHour}
              selectedSegment={draft?.segment ?? null}
              onSelectSegment={handleSelectSegment}
              panelInDay={isSmallScreen ? bookingPanel : undefined}
            />
            {!isSmallScreen && bookingPanel}
          </>
        )}
      </Card>
    </div>
  )
}

// Why a booking can't be moved from this page, or null when it can. The API
// checks the same rules.
function describeMoveProblem(reservation: ReservationResponse, selectedResourceId: number | null) {
  if (reservation.status === 'Cancelled') {
    return "This booking is cancelled, so it can't be moved."
  }

  if (reservation.startTime <= nowInSchedulingZone()) {
    return "This booking has started, so it can't be moved."
  }

  if (selectedResourceId === null) {
    return "This booking's resource isn't open for booking, so the booking can't be moved."
  }

  if (reservation.resourceId !== selectedResourceId) {
    return 'Bookings can only be moved to another time on the same resource.'
  }

  return null
}
