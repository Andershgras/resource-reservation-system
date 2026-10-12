import { type FormEvent, useEffect, useState } from 'react'
import {
  createAvailability,
  deleteAvailability,
  getAvailabilities,
  updateAvailability,
} from '../api/availabilitiesApi'
import {
  createAvailabilityRule,
  deleteAvailabilityRule,
  getAvailabilityRules,
  updateAvailabilityRule,
} from '../api/availabilityRulesApi'
import {
  getResourceSchedule,
} from '../api/resourcesApi'
import {
  cancelReservation,
  createReservation,
  getMyReservations,
  getReservations,
} from '../api/reservationsApi'
import type {
  AvailabilityResponse,
  AvailabilityRuleResponse,
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
  toTimeOfDay,
} from '../lib/dates'
import { getErrorMessage, getQueryErrorMessage } from '../lib/errors'
import { getSlotKey } from '../lib/schedule'
import {
  validateAvailabilityForm,
  validateAvailabilityRuleForm,
  validateReservationSlotSelection,
} from '../lib/validation'
import { AdminHomeView } from '../views/AdminHomeView'
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
  const [availabilities, setAvailabilities] = useState<AvailabilityResponse[]>(
    [],
  )
  const [availabilityMessage, setAvailabilityMessage] = useState('')
  const [isLoadingAvailabilities, setIsLoadingAvailabilities] = useState(false)
  const [availabilityResourceId, setAvailabilityResourceId] = useState('')
  const [availabilityStartTime, setAvailabilityStartTime] = useState('')
  const [availabilityEndTime, setAvailabilityEndTime] = useState('')
  const [availabilityValidationMessage, setAvailabilityValidationMessage] =
    useState('')
  const [editingAvailabilityId, setEditingAvailabilityId] = useState<
    number | null
  >(null)
  const [isSavingAvailability, setIsSavingAvailability] = useState(false)
  const [deletingAvailabilityId, setDeletingAvailabilityId] = useState<
    number | null
  >(null)
  const [availabilityRules, setAvailabilityRules] = useState<
    AvailabilityRuleResponse[]
  >([])
  const [availabilityRuleMessage, setAvailabilityRuleMessage] = useState('')
  const [isLoadingAvailabilityRules, setIsLoadingAvailabilityRules] =
    useState(false)
  const [availabilityRuleResourceId, setAvailabilityRuleResourceId] =
    useState('')
  const [availabilityRuleDayOfWeek, setAvailabilityRuleDayOfWeek] = useState('')
  const [availabilityRuleStartTime, setAvailabilityRuleStartTime] = useState('')
  const [availabilityRuleEndTime, setAvailabilityRuleEndTime] = useState('')
  const [availabilityRuleValidationMessage, setAvailabilityRuleValidationMessage] =
    useState('')
  const [editingAvailabilityRuleId, setEditingAvailabilityRuleId] = useState<
    number | null
  >(null)
  const [isSavingAvailabilityRule, setIsSavingAvailabilityRule] =
    useState(false)
  const [deletingAvailabilityRuleId, setDeletingAvailabilityRuleId] = useState<
    number | null
  >(null)
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
  const [adminReservations, setAdminReservations] = useState<
    ReservationResponse[]
  >([])
  const [adminReservationsMessage, setAdminReservationsMessage] = useState('')
  const [isLoadingAdminReservations, setIsLoadingAdminReservations] =
    useState(false)
  const [cancellingReservationId, setCancellingReservationId] = useState<
    number | null
  >(null)
  const [adminCancellingReservationId, setAdminCancellingReservationId] =
    useState<number | null>(null)

  useEffect(() => {
    if (!currentUser) {
      return
    }

    let isActive = true

    if (currentUser.role === 'User') {
      void loadMyReservations(() => isActive)
    }

    if (currentUser.role === 'Admin') {
      void loadAvailabilities(() => isActive)
      void loadAvailabilityRules(() => isActive)
      void loadAdminReservations(() => isActive)
    }

    return () => {
      isActive = false
    }
  }, [currentUser])

  async function loadAvailabilities(shouldUpdate = () => true) {
    setIsLoadingAvailabilities(true)
    setAvailabilityMessage('')

    try {
      const loadedAvailabilities = await getAvailabilities()

      if (shouldUpdate()) {
        setAvailabilities(loadedAvailabilities)
      }
    } catch (error) {
      if (shouldUpdate()) {
        setAvailabilityMessage(getErrorMessage(error))
      }
    } finally {
      if (shouldUpdate()) {
        setIsLoadingAvailabilities(false)
      }
    }
  }

  async function loadAvailabilityRules(shouldUpdate = () => true) {
    setIsLoadingAvailabilityRules(true)
    setAvailabilityRuleMessage('')

    try {
      const loadedAvailabilityRules = await getAvailabilityRules()

      if (shouldUpdate()) {
        setAvailabilityRules(loadedAvailabilityRules)
      }
    } catch (error) {
      if (shouldUpdate()) {
        setAvailabilityRuleMessage(getErrorMessage(error))
      }
    } finally {
      if (shouldUpdate()) {
        setIsLoadingAvailabilityRules(false)
      }
    }
  }

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

  async function loadAdminReservations(shouldUpdate = () => true) {
    setIsLoadingAdminReservations(true)
    setAdminReservationsMessage('')

    try {
      const loadedReservations = await getReservations()

      if (shouldUpdate()) {
        setAdminReservations(loadedReservations)
      }
    } catch (error) {
      if (shouldUpdate()) {
        setAdminReservationsMessage(getErrorMessage(error))
      }
    } finally {
      if (shouldUpdate()) {
        setIsLoadingAdminReservations(false)
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

  async function handleSaveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAvailabilityMessage('')
    setAvailabilityValidationMessage('')

    const validationMessage = validateAvailabilityForm(
      availabilityResourceId,
      availabilityStartTime,
      availabilityEndTime,
    )

    if (validationMessage) {
      setAvailabilityValidationMessage(validationMessage)
      return
    }

    setIsSavingAvailability(true)

    try {
      const request = {
        resourceId: Number(availabilityResourceId),
        startTime: availabilityStartTime,
        endTime: availabilityEndTime,
      }

      if (editingAvailabilityId) {
        await updateAvailability(editingAvailabilityId, request)
      } else {
        await createAvailability(request)
      }

      const loadedAvailabilities = await getAvailabilities()

      setAvailabilities(loadedAvailabilities)
      resetAvailabilityForm()
      setAvailabilityMessage(
        editingAvailabilityId ? 'Availability updated.' : 'Availability created.',
      )
    } catch (error) {
      setAvailabilityMessage(getErrorMessage(error))
    } finally {
      setIsSavingAvailability(false)
    }
  }

  async function handleSaveAvailabilityRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAvailabilityRuleMessage('')
    setAvailabilityRuleValidationMessage('')

    const validationMessage = validateAvailabilityRuleForm(
      availabilityRuleResourceId,
      availabilityRuleDayOfWeek,
      availabilityRuleStartTime,
      availabilityRuleEndTime,
    )

    if (validationMessage) {
      setAvailabilityRuleValidationMessage(validationMessage)
      return
    }

    setIsSavingAvailabilityRule(true)

    try {
      const request = {
        resourceId: Number(availabilityRuleResourceId),
        dayOfWeek: Number(availabilityRuleDayOfWeek),
        startTime: availabilityRuleStartTime,
        endTime: availabilityRuleEndTime,
      }

      if (editingAvailabilityRuleId) {
        await updateAvailabilityRule(editingAvailabilityRuleId, request)
      } else {
        await createAvailabilityRule(request)
      }

      const loadedAvailabilityRules = await getAvailabilityRules()

      setAvailabilityRules(loadedAvailabilityRules)
      resetAvailabilityRuleForm()
      setAvailabilityRuleMessage(
        editingAvailabilityRuleId
          ? 'Weekly schedule updated.'
          : 'Weekly schedule created.',
      )
    } catch (error) {
      setAvailabilityRuleMessage(getErrorMessage(error))
    } finally {
      setIsSavingAvailabilityRule(false)
    }
  }

  function handleEditAvailability(availability: AvailabilityResponse) {
    setEditingAvailabilityId(availability.id)
    setAvailabilityResourceId(availability.resourceId.toString())
    setAvailabilityStartTime(toDateTimeLocalValue(availability.startTime))
    setAvailabilityEndTime(toDateTimeLocalValue(availability.endTime))
    setAvailabilityMessage('')
    setAvailabilityValidationMessage('')
  }

  async function deleteAvailabilityAfterConfirmation(
    availability: AvailabilityResponse,
  ) {
    setAvailabilityMessage('')
    setDeletingAvailabilityId(availability.id)

    try {
      await deleteAvailability(availability.id)
      const loadedAvailabilities = await getAvailabilities()

      setAvailabilities(loadedAvailabilities)

      if (editingAvailabilityId === availability.id) {
        resetAvailabilityForm()
      }

      setAvailabilityMessage('Availability deleted.')
    } catch (error) {
      setAvailabilityMessage(getErrorMessage(error))
    } finally {
      setDeletingAvailabilityId(null)
    }
  }

  function handleDeleteAvailability(availability: AvailabilityResponse) {
    confirm({
      title: 'Delete availability',
      message: `Delete availability for "${availability.resourceName}"?`,
      confirmLabel: 'Delete availability',
      onConfirm: () => deleteAvailabilityAfterConfirmation(availability),
    })
  }

  function resetAvailabilityForm() {
    setEditingAvailabilityId(null)
    setAvailabilityResourceId('')
    setAvailabilityStartTime('')
    setAvailabilityEndTime('')
    setAvailabilityValidationMessage('')
  }

  function handleEditAvailabilityRule(rule: AvailabilityRuleResponse) {
    setEditingAvailabilityRuleId(rule.id)
    setAvailabilityRuleResourceId(rule.resourceId.toString())
    setAvailabilityRuleDayOfWeek(rule.dayOfWeek.toString())
    setAvailabilityRuleStartTime(toTimeOfDay(rule.startTime))
    setAvailabilityRuleEndTime(toTimeOfDay(rule.endTime))
    setAvailabilityRuleMessage('')
    setAvailabilityRuleValidationMessage('')
  }

  async function deleteAvailabilityRuleAfterConfirmation(
    rule: AvailabilityRuleResponse,
  ) {
    setAvailabilityRuleMessage('')
    setDeletingAvailabilityRuleId(rule.id)

    try {
      await deleteAvailabilityRule(rule.id)
      const loadedAvailabilityRules = await getAvailabilityRules()

      setAvailabilityRules(loadedAvailabilityRules)

      if (editingAvailabilityRuleId === rule.id) {
        resetAvailabilityRuleForm()
      }

      setAvailabilityRuleMessage('Weekly schedule deleted.')
    } catch (error) {
      setAvailabilityRuleMessage(getErrorMessage(error))
    } finally {
      setDeletingAvailabilityRuleId(null)
    }
  }

  function handleDeleteAvailabilityRule(rule: AvailabilityRuleResponse) {
    confirm({
      title: 'Delete weekly schedule',
      message: `Delete ${rule.dayName} schedule for "${rule.resourceName}"?`,
      confirmLabel: 'Delete weekly schedule',
      onConfirm: () => deleteAvailabilityRuleAfterConfirmation(rule),
    })
  }

  function resetAvailabilityRuleForm() {
    setEditingAvailabilityRuleId(null)
    setAvailabilityRuleResourceId('')
    setAvailabilityRuleDayOfWeek('')
    setAvailabilityRuleStartTime('')
    setAvailabilityRuleEndTime('')
    setAvailabilityRuleValidationMessage('')
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
      const loadedAvailabilities = await getAvailabilities()

      setReservations(loadedReservations)
      setAvailabilities(loadedAvailabilities)
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

  async function adminCancelReservationAfterConfirmation(
    reservation: ReservationResponse,
  ) {
    setAdminReservationsMessage('')
    setAdminCancellingReservationId(reservation.id)

    try {
      await cancelReservation(reservation.id)
      const loadedReservations = await getReservations()

      setAdminReservations(loadedReservations)
      setAdminReservationsMessage('Reservation cancelled.')
    } catch (error) {
      setAdminReservationsMessage(getErrorMessage(error))
    } finally {
      setAdminCancellingReservationId(null)
    }
  }

  function handleAdminCancelReservation(reservation: ReservationResponse) {
    confirm({
      title: 'Cancel reservation',
      message: `Cancel reservation for "${reservation.resourceName}"?`,
      confirmLabel: 'Cancel reservation',
      onConfirm: () => adminCancelReservationAfterConfirmation(reservation),
    })
  }

  // RequireAuth then sends the browser to the login screen.
  function handleLogout() {
    logOut()
  }

  if (currentUser.role === 'Admin') {
    return (
      <>
        <AdminHomeView
          currentUser={currentUser}
          onLogout={handleLogout}
          resources={resources}
          availabilities={availabilities}
          availabilityMessage={availabilityMessage}
          isLoadingAvailabilities={isLoadingAvailabilities}
          availabilityResourceId={availabilityResourceId}
          setAvailabilityResourceId={setAvailabilityResourceId}
          availabilityStartTime={availabilityStartTime}
          setAvailabilityStartTime={setAvailabilityStartTime}
          availabilityEndTime={availabilityEndTime}
          setAvailabilityEndTime={setAvailabilityEndTime}
          availabilityValidationMessage={availabilityValidationMessage}
          editingAvailabilityId={editingAvailabilityId}
          isSavingAvailability={isSavingAvailability}
          deletingAvailabilityId={deletingAvailabilityId}
          onSaveAvailability={handleSaveAvailability}
          onEditAvailability={handleEditAvailability}
          onDeleteAvailability={handleDeleteAvailability}
          onCancelAvailabilityEdit={resetAvailabilityForm}
          availabilityRules={availabilityRules}
          availabilityRuleMessage={availabilityRuleMessage}
          isLoadingAvailabilityRules={isLoadingAvailabilityRules}
          availabilityRuleResourceId={availabilityRuleResourceId}
          setAvailabilityRuleResourceId={setAvailabilityRuleResourceId}
          availabilityRuleDayOfWeek={availabilityRuleDayOfWeek}
          setAvailabilityRuleDayOfWeek={setAvailabilityRuleDayOfWeek}
          availabilityRuleStartTime={availabilityRuleStartTime}
          setAvailabilityRuleStartTime={setAvailabilityRuleStartTime}
          availabilityRuleEndTime={availabilityRuleEndTime}
          setAvailabilityRuleEndTime={setAvailabilityRuleEndTime}
          availabilityRuleValidationMessage={
            availabilityRuleValidationMessage
          }
          editingAvailabilityRuleId={editingAvailabilityRuleId}
          isSavingAvailabilityRule={isSavingAvailabilityRule}
          deletingAvailabilityRuleId={deletingAvailabilityRuleId}
          onSaveAvailabilityRule={handleSaveAvailabilityRule}
          onEditAvailabilityRule={handleEditAvailabilityRule}
          onDeleteAvailabilityRule={handleDeleteAvailabilityRule}
          onCancelAvailabilityRuleEdit={resetAvailabilityRuleForm}
          adminReservations={adminReservations}
          adminReservationsMessage={adminReservationsMessage}
          isLoadingAdminReservations={isLoadingAdminReservations}
          adminCancellingReservationId={adminCancellingReservationId}
          onAdminCancelReservation={handleAdminCancelReservation}
          formatDateTime={formatDateTime}
        />
      </>
    )
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
