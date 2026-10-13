import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ApiError } from '../../api/client'
import { useUnsavedChangesGuard } from '../../components/useUnsavedChangesGuard'
import {
  buildCalendarWeek,
  defaultEndTime,
  endOptions,
  isWithinInterval,
  startOfWeek,
  startOptions,
  visibleHours,
  type CalendarSegment,
} from '../../lib/calendar'
import { addDaysToDateKey, formatDate, formatDateTimeRange, todayInSchedulingZone } from '../../lib/dates'
import { getErrorMessage, getFormErrors, type FieldErrors } from '../../lib/errors'
import { Alert, type Notice } from '../../ui/Alert'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Field, Input } from '../../ui/Field'
import { EmptyState, LoadingState } from '../../ui/States'
import { useMediaQuery } from '../../ui/useMediaQuery'
import { useCreateReservation } from '../reservations/reservationQueries'
import { useResources } from '../resources/resourceQueries'
import { BookingCalendar } from './BookingCalendar'
import { BookingPanel, type BookingField } from './BookingPanel'
import { useResourceSchedule } from './bookingQueries'
import { bookingSelectionFor, toBookingSearch, type BookingSelection } from './bookingSearch'
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

// /book: choose a resource, then a free time in its weekly calendar.
export function BookingPage() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const resourcesQuery = useResources()
  const activeResources = (resourcesQuery.data ?? []).filter((resource) => resource.isActive)
  const selection = bookingSelectionFor(search, resourcesQuery.data)
  const scheduleQuery = useResourceSchedule(selection)
  const createReservation = useCreateReservation()
  const today = todayInSchedulingZone()
  const thisWeek = startOfWeek(today)
  const schedule = selection.resourceId === null ? null : scheduleQuery.data ?? null
  const selectedResource = activeResources.find((resource) => resource.id === selection.resourceId)
  const days = useMemo(
    () => buildCalendarWeek(schedule, selection.weekStart, today),
    [schedule, selection.weekStart, today],
  )
  const { firstHour, lastHour } = visibleHours(days)
  const noticeRef = useRef<HTMLDivElement>(null)
  // Matches the calendar's switch to a list of days (BookingCalendar.css).
  const isSmallScreen = useMediaQuery('(max-width: 760px)')
  // Set when a booking finishes, so focus moves to its result once it shows.
  const focusNoticeRef = useRef(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<BookingField>>({})
  const [formError, setFormError] = useState('')

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

  // When the address changes, including through the back button, a time
  // being chosen for another week or resource is dropped.
  const selectionKey = toBookingSearch(selection)
  const [shownSelectionKey, setShownSelectionKey] = useState(selectionKey)

  if (shownSelectionKey !== selectionKey) {
    setShownSelectionKey(selectionKey)
    closeDraft()
    setNotice(null)
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
    const starts = startOptions(segment.interval)
    // The day the user clicked, for a period that continues past midnight.
    const startTime = starts.find((option) => option.value >= segment.start)?.value ?? starts[0]?.value ?? ''
    const endTime = defaultEndTime(segment.interval, startTime)

    setNotice(null)
    setFieldErrors({})
    setFormError('')
    setDraft({ segment, startTime, endTime, suggestedStartTime: startTime, suggestedEndTime: endTime })
  }

  function handleStartTimeChange(startTime: string) {
    setDraft((current) => {
      if (!current) {
        return current
      }

      const ends = endOptions(current.segment.interval, startTime)
      const endTime = ends.some((option) => option.value === current.endTime)
        ? current.endTime
        : defaultEndTime(current.segment.interval, startTime)

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

    try {
      // Resolves once the reservation lists and the calendar have reloaded.
      await createReservation.mutateAsync({
        resourceId: selection.resourceId,
        startTime: draft.startTime,
        endTime: draft.endTime,
      })
      closeDraft()
      focusNoticeRef.current = true
      setNotice({
        tone: 'success',
        text: `Reservation created: ${formatDateTimeRange(draft.startTime, draft.endTime)}.`,
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Someone else booked it first: show the calendar as it is now.
        closeDraft()
        focusNoticeRef.current = true
        setNotice({ tone: 'danger', text: `${error.message} The calendar has been updated.` })
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
      interval={draft.segment.interval}
      startTime={draft.startTime}
      endTime={draft.endTime}
      onStartTimeChange={handleStartTimeChange}
      onEndTimeChange={(endTime) => setDraft((current) => current && { ...current, endTime })}
      fieldErrors={fieldErrors}
      formError={formError}
      isReserving={createReservation.isPending}
      onReserve={() => void handleReserve()}
      onCancel={closeDraft}
    />
  )
  const weekEnd = addDaysToDateKey(selection.weekStart, 6)
  const hasFreeTime = days.some((day) => day.status === 'open')

  return (
    <div className="booking-layout">
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

        {selection.resourceId === null && (
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
        {schedule && (
          <>
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
