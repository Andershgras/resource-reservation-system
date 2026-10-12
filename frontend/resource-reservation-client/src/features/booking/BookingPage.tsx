import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { BookableSlotResponse, ResourceResponse } from '../../api/types'
import { ResourceBookingSection } from '../../components/ResourceBookingSection'
import { toDateTimeLocalValue } from '../../lib/dates'
import { getErrorMessage, getQueryErrorMessage } from '../../lib/errors'
import { getSlotKey } from '../../lib/schedule'
import { validateReservationSlotSelection } from '../../lib/validation'
import { useCreateReservation } from '../reservations/reservationQueries'
import { useResources } from '../resources/resourceQueries'
import { useResourceSchedule } from './bookingQueries'
import { bookingSelectionFor, toBookingSearch, type BookingSelection } from './bookingSearch'

// /book: choose a resource and a date range, then book a time from its schedule.
export function BookingPage() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const resourcesQuery = useResources()
  const selection = bookingSelectionFor(search, resourcesQuery.data)
  const scheduleQuery = useResourceSchedule(selection)
  const createReservation = useCreateReservation()
  const [fromDate, setFromDate] = useState(selection.fromDate)
  const [toDate, setToDate] = useState(selection.toDate)
  const [scheduleMessage, setScheduleMessage] = useState('')
  const [reservationMessage, setReservationMessage] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null)
  const [reservingSlotKey, setReservingSlotKey] = useState<string | null>(null)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  function resetSlotSelection() {
    setSelectedSlotKey(null)
    setStartTime('')
    setEndTime('')
    setValidationMessage('')
  }

  // When the selection in the address changes, including through the back
  // button, the date fields follow it and any chosen time is dropped.
  const selectionKey = toBookingSearch(selection)
  const [shownSelectionKey, setShownSelectionKey] = useState(selectionKey)

  if (shownSelectionKey !== selectionKey) {
    setShownSelectionKey(selectionKey)
    setFromDate(selection.fromDate)
    setToDate(selection.toDate)
    resetSlotSelection()
  }

  function showSchedule(resourceId: number | null) {
    setScheduleMessage('')
    setReservationMessage('')
    setValidationMessage('')

    if (resourceId === null) {
      setScheduleMessage('Choose a resource before loading its schedule.')
      return
    }

    if (!fromDate || !toDate) {
      setScheduleMessage('Select a from date and to date.')
      return
    }

    if (toDate < fromDate) {
      setScheduleMessage('To date must be on or after from date.')
      return
    }

    const nextSelection: BookingSelection = { resourceId, fromDate, toDate }

    if (toBookingSearch(nextSelection) === selectionKey) {
      // The same schedule again: load the latest version rather than the cache.
      resetSlotSelection()
      void scheduleQuery.refetch()
      return
    }

    navigate({ search: toBookingSearch(nextSelection) })
  }

  function handleSelectSlot(slot: BookableSlotResponse) {
    setSelectedSlotKey(getSlotKey(slot))
    setStartTime(toDateTimeLocalValue(slot.startTime))
    setEndTime(toDateTimeLocalValue(slot.endTime))
    setReservationMessage('')
    setValidationMessage('')
  }

  async function handleReserve(slot: BookableSlotResponse) {
    setReservationMessage('')
    setValidationMessage('')

    if (selection.resourceId === null) {
      setValidationMessage('Choose a resource schedule first.')
      return
    }

    const validationError = validateReservationSlotSelection(slot, startTime, endTime)

    if (validationError) {
      setValidationMessage(validationError)
      return
    }

    setReservingSlotKey(getSlotKey(slot))

    try {
      // Resolves once the reservation lists and the schedule have reloaded.
      await createReservation.mutateAsync({ resourceId: selection.resourceId, startTime, endTime })
      resetSlotSelection()
      setReservationMessage('Reservation created.')
    } catch (error) {
      setReservationMessage(getErrorMessage(error))
    } finally {
      setReservingSlotKey(null)
    }
  }

  return (
    <ResourceBookingSection
      resources={resourcesQuery.data ?? []}
      resourceMessage={getQueryErrorMessage(resourcesQuery.error)}
      isLoadingResources={resourcesQuery.isPending}
      selectedScheduleResourceId={selection.resourceId?.toString() ?? ''}
      scheduleFromDate={fromDate}
      setScheduleFromDate={setFromDate}
      scheduleToDate={toDate}
      setScheduleToDate={setToDate}
      resourceSchedule={selection.resourceId === null ? null : scheduleQuery.data ?? null}
      resourceScheduleMessage={scheduleMessage || getQueryErrorMessage(scheduleQuery.error)}
      reservationMessage={reservationMessage}
      reservationValidationMessage={validationMessage}
      isLoadingResourceSchedule={scheduleQuery.isFetching}
      selectedScheduleSlotKey={selectedSlotKey}
      reservingScheduleSlotKey={reservingSlotKey}
      reservationStartTime={startTime}
      setReservationStartTime={setStartTime}
      reservationEndTime={endTime}
      setReservationEndTime={setEndTime}
      onSelectResourceForSchedule={(resource: ResourceResponse) => showSchedule(resource.id)}
      onLoadResourceSchedule={() => showSchedule(selection.resourceId)}
      onSelectScheduleSlot={handleSelectSlot}
      onCancelScheduleSlotSelection={resetSlotSelection}
      onReserveScheduleSlot={(slot) => void handleReserve(slot)}
      formatDateTimeInput={toDateTimeLocalValue}
    />
  )
}
