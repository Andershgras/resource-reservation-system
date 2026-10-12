import { useEffect, useState } from 'react'
import {
  getResourceSchedule,
} from '../api/resourcesApi'
import {
  cancelReservation,
  createReservation,
  getMyReservations,
} from '../api/reservationsApi'
import type {
  BookableSlotResponse,
  ReservationResponse,
  ResourceScheduleResponse,
  ResourceResponse,
} from '../api/types'
import { useAuth, useCurrentUser } from '../auth/authContext'
import { useConfirm } from '../components/confirmContext'
import { useResources } from '../features/resources/resourceQueries'
import {
  addDays,
  formatDateTime,
  toDateInputValue,
  toDateTimeLocalValue,
} from '../lib/dates'
import { getErrorMessage, getQueryErrorMessage } from '../lib/errors'
import { getSlotKey } from '../lib/schedule'
import {
  validateReservationSlotSelection,
} from '../lib/validation'
import { UserHomeView } from '../views/UserHomeView'

// The logged-in screens and, until they move into feature hooks, all of their
// state. Mounted inside RequireAuth, so when the session ends the redirect to
// the login screen unmounts it and discards the previous user's data.
export function Workspace() {
  const currentUser = useCurrentUser()
  const { logOut } = useAuth()
  const confirm = useConfirm()
  const resourcesQuery = useResources()
  const resources = resourcesQuery.data ?? []
  const resourceMessage = getQueryErrorMessage(resourcesQuery.error)
  const isLoadingResources = resourcesQuery.isPending
  const [reservationStartTime, setReservationStartTime] = useState('')
  const [reservationEndTime, setReservationEndTime] = useState('')
  const [reservationValidationMessage, setReservationValidationMessage] =
    useState('')
  const [reservationMessage, setReservationMessage] = useState('')
  const [selectedScheduleResourceId, setSelectedScheduleResourceId] =
    useState('')
  const [scheduleFromDate, setScheduleFromDate] = useState(() =>
    toDateInputValue(new Date()),
  )
  const [scheduleToDate, setScheduleToDate] = useState(() =>
    toDateInputValue(addDays(new Date(), 6)),
  )
  const [resourceSchedule, setResourceSchedule] =
    useState<ResourceScheduleResponse | null>(null)
  const [resourceScheduleMessage, setResourceScheduleMessage] = useState('')
  const [isLoadingResourceSchedule, setIsLoadingResourceSchedule] =
    useState(false)
  const [selectedScheduleSlotKey, setSelectedScheduleSlotKey] = useState<
    string | null
  >(null)
  const [reservingScheduleSlotKey, setReservingScheduleSlotKey] = useState<
    string | null
  >(null)
  const [reservations, setReservations] = useState<ReservationResponse[]>([])
  const [myReservationsMessage, setMyReservationsMessage] = useState('')
  const [isLoadingReservations, setIsLoadingReservations] = useState(false)
  const [cancellingReservationId, setCancellingReservationId] = useState<
    number | null
  >(null)

  useEffect(() => {
    let isActive = true

    void loadMyReservations(() => isActive)

    return () => {
      isActive = false
    }
  }, [])

  async function loadMyReservations(shouldUpdate = () => true) {
    setIsLoadingReservations(true)
    setMyReservationsMessage('')

    try {
      const loadedReservations = await getMyReservations()

      if (shouldUpdate()) {
        setReservations(loadedReservations)
      }
    } catch (error) {
      if (shouldUpdate()) {
        setMyReservationsMessage(getErrorMessage(error))
      }
    } finally {
      if (shouldUpdate()) {
        setIsLoadingReservations(false)
      }
    }
  }

  async function loadResourceSchedule(
    resourceId = selectedScheduleResourceId,
    fromDate = scheduleFromDate,
    toDate = scheduleToDate,
  ) {
    setResourceScheduleMessage('')
    setReservationMessage('')
    setReservationValidationMessage('')

    if (!resourceId) {
      setResourceScheduleMessage('Choose a resource before loading its schedule.')
      return
    }

    if (!fromDate || !toDate) {
      setResourceScheduleMessage('Select a from date and to date.')
      return
    }

    if (toDate < fromDate) {
      setResourceScheduleMessage('To date must be on or after from date.')
      return
    }

    setIsLoadingResourceSchedule(true)

    try {
      const loadedSchedule = await getResourceSchedule(
        Number(resourceId),
        fromDate,
        toDate,
      )

      setResourceSchedule(loadedSchedule)
      resetScheduleSlotSelection()
    } catch (error) {
      setResourceScheduleMessage(getErrorMessage(error))
    } finally {
      setIsLoadingResourceSchedule(false)
    }
  }

  function handleSelectResourceForSchedule(resource: ResourceResponse) {
    setSelectedScheduleResourceId(resource.id.toString())
    void loadResourceSchedule(resource.id.toString())
  }

  function handleSelectScheduleSlot(slot: BookableSlotResponse) {
    setSelectedScheduleSlotKey(getSlotKey(slot))
    setReservationStartTime(toDateTimeLocalValue(slot.startTime))
    setReservationEndTime(toDateTimeLocalValue(slot.endTime))
    setReservationMessage('')
    setReservationValidationMessage('')
  }

  async function handleCreateReservationFromScheduleSlot(
    slot: BookableSlotResponse,
  ) {
    setReservationMessage('')
    setReservationValidationMessage('')

    if (!resourceSchedule) {
      setReservationValidationMessage('Choose a resource schedule first.')
      return
    }

    const validationMessage = validateReservationSlotSelection(
      slot,
      reservationStartTime,
      reservationEndTime,
    )

    if (validationMessage) {
      setReservationValidationMessage(validationMessage)
      return
    }

    const slotKey = getSlotKey(slot)
    setReservingScheduleSlotKey(slotKey)

    try {
      await createReservation({
        resourceId: resourceSchedule.resourceId,
        startTime: reservationStartTime,
        endTime: reservationEndTime,
      })
      const loadedReservations = await getMyReservations()

      setReservations(loadedReservations)
      await loadResourceSchedule(
        resourceSchedule.resourceId.toString(),
        scheduleFromDate,
        scheduleToDate,
      )
      setReservationMessage('Reservation created.')
    } catch (error) {
      setReservationMessage(getErrorMessage(error))
    } finally {
      setReservingScheduleSlotKey(null)
    }
  }

  async function cancelReservationAfterConfirmation(
    reservation: ReservationResponse,
  ) {
    setMyReservationsMessage('')
    setCancellingReservationId(reservation.id)

    try {
      await cancelReservation(reservation.id)
      const loadedReservations = await getMyReservations()

      setReservations(loadedReservations)
      setMyReservationsMessage('Reservation cancelled.')
    } catch (error) {
      setMyReservationsMessage(getErrorMessage(error))
    } finally {
      setCancellingReservationId(null)
    }
  }

  function resetScheduleSlotSelection() {
    setSelectedScheduleSlotKey(null)
    setReservationStartTime('')
    setReservationEndTime('')
    setReservationValidationMessage('')
  }

  function handleCancelReservation(reservation: ReservationResponse) {
    confirm({
      title: 'Cancel reservation',
      message: `Cancel reservation for "${reservation.resourceName}"?`,
      confirmLabel: 'Cancel reservation',
      onConfirm: () => cancelReservationAfterConfirmation(reservation),
    })
  }

  // RequireAuth then sends the browser to the login screen.
  function handleLogout() {
    logOut()
  }

  return (
    <>
      <UserHomeView
        currentUser={currentUser}
        onLogout={handleLogout}
        resources={resources}
        resourceMessage={resourceMessage}
        isLoadingResources={isLoadingResources}
        reservations={reservations}
        reservationMessage={reservationMessage}
        reservationValidationMessage={reservationValidationMessage}
        selectedScheduleResourceId={selectedScheduleResourceId}
        scheduleFromDate={scheduleFromDate}
        setScheduleFromDate={setScheduleFromDate}
        scheduleToDate={scheduleToDate}
        setScheduleToDate={setScheduleToDate}
        resourceSchedule={resourceSchedule}
        resourceScheduleMessage={resourceScheduleMessage}
        isLoadingResourceSchedule={isLoadingResourceSchedule}
        selectedScheduleSlotKey={selectedScheduleSlotKey}
        reservingScheduleSlotKey={reservingScheduleSlotKey}
        myReservationsMessage={myReservationsMessage}
        isLoadingReservations={isLoadingReservations}
        reservationStartTime={reservationStartTime}
        setReservationStartTime={setReservationStartTime}
        reservationEndTime={reservationEndTime}
        setReservationEndTime={setReservationEndTime}
        cancellingReservationId={cancellingReservationId}
        onSelectResourceForSchedule={handleSelectResourceForSchedule}
        onLoadResourceSchedule={() => void loadResourceSchedule()}
        onSelectScheduleSlot={handleSelectScheduleSlot}
        onCancelScheduleSlotSelection={resetScheduleSlotSelection}
        onReserveScheduleSlot={(slot) =>
          void handleCreateReservationFromScheduleSlot(slot)
        }
        onCancelReservation={handleCancelReservation}
        formatDateTime={formatDateTime}
        formatDateTimeInput={toDateTimeLocalValue}
      />
    </>
  )
}
