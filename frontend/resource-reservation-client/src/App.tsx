import { type FormEvent, useEffect, useState } from 'react'
import {
  createAvailability,
  deleteAvailability,
  getAvailabilities,
  updateAvailability,
} from './api/availabilitiesApi'
import {
  createAvailabilityRule,
  deleteAvailabilityRule,
  getAvailabilityRules,
  updateAvailabilityRule,
} from './api/availabilityRulesApi'
import { login, register } from './api/authApi'
import { ApiError } from './api/client'
import {
  createResource,
  deleteResource,
  getResources,
  updateResource,
} from './api/resourcesApi'
import {
  cancelReservation,
  createReservation,
  getMyReservations,
  getReservations,
} from './api/reservationsApi'
import type {
  AvailabilityResponse,
  AvailabilityRuleResponse,
  ReservationResponse,
  ResourceResponse,
  UserResponse,
} from './api/types'
import {
  clearAuthSession,
  getAuthUser,
  saveAuthSession,
} from './auth/authStorage'
import type { AuthMode } from './components/AuthForm'
import { AdminHomeView } from './views/AdminHomeView'
import { AuthView } from './views/AuthView'
import { UserHomeView } from './views/UserHomeView'
import './App.css'

type ConfirmationRequest = {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void>
}

function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(() =>
    getAuthUser(),
  )
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resources, setResources] = useState<ResourceResponse[]>([])
  const [resourceMessage, setResourceMessage] = useState('')
  const [isLoadingResources, setIsLoadingResources] = useState(false)
  const [resourceName, setResourceName] = useState('')
  const [resourceDescription, setResourceDescription] = useState('')
  const [resourceLocation, setResourceLocation] = useState('')
  const [resourceIsActive, setResourceIsActive] = useState(true)
  const [editingResourceId, setEditingResourceId] = useState<number | null>(null)
  const [isSavingResource, setIsSavingResource] = useState(false)
  const [deletingResourceId, setDeletingResourceId] = useState<number | null>(
    null,
  )
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
  const [reservingAvailabilityId, setReservingAvailabilityId] = useState<
    number | null
  >(null)
  const [selectedReservationAvailabilityId, setSelectedReservationAvailabilityId] =
    useState<number | null>(null)
  const [reservationStartTime, setReservationStartTime] = useState('')
  const [reservationEndTime, setReservationEndTime] = useState('')
  const [reservationValidationMessage, setReservationValidationMessage] =
    useState('')
  const [reservationMessage, setReservationMessage] = useState('')
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
  const [confirmationRequest, setConfirmationRequest] =
    useState<ConfirmationRequest | null>(null)
  const [isConfirmingAction, setIsConfirmingAction] = useState(false)

  useEffect(() => {
    if (!currentUser) {
      return
    }

    let isActive = true

    void loadResources(() => isActive)
    void loadAvailabilities(() => isActive)

    if (currentUser.role === 'User') {
      void loadMyReservations(() => isActive)
    }

    if (currentUser.role === 'Admin') {
      void loadAvailabilityRules(() => isActive)
      void loadAdminReservations(() => isActive)
    }

    return () => {
      isActive = false
    }
  }, [currentUser])

  async function loadResources(shouldUpdate = () => true) {
    setIsLoadingResources(true)
    setResourceMessage('')

    try {
      const loadedResources = await getResources()

      if (shouldUpdate()) {
        setResources(loadedResources)
      }
    } catch (error) {
      if (shouldUpdate()) {
        setResourceMessage(getErrorMessage(error))
      }
    } finally {
      if (shouldUpdate()) {
        setIsLoadingResources(false)
      }
    }
  }

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

  async function handleSaveResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResourceMessage('')
    setIsSavingResource(true)

    try {
      if (editingResourceId) {
        await updateResource(editingResourceId, {
          name: resourceName.trim(),
          description: emptyToNull(resourceDescription),
          location: emptyToNull(resourceLocation),
          isActive: resourceIsActive,
        })
      } else {
        await createResource({
          name: resourceName.trim(),
          description: emptyToNull(resourceDescription),
          location: emptyToNull(resourceLocation),
        })
      }

      const loadedResources = await getResources()

      setResources(loadedResources)

      if (currentUser?.role === 'Admin') {
        setAvailabilityRules(await getAvailabilityRules())
      }

      resetResourceForm()
      setResourceMessage(editingResourceId ? 'Resource updated.' : 'Resource created.')
    } catch (error) {
      setResourceMessage(getErrorMessage(error))
    } finally {
      setIsSavingResource(false)
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

  function handleEditResource(resource: ResourceResponse) {
    setEditingResourceId(resource.id)
    setResourceName(resource.name)
    setResourceDescription(resource.description ?? '')
    setResourceLocation(resource.location ?? '')
    setResourceIsActive(resource.isActive)
    setResourceMessage('')
  }

  async function deleteResourceAfterConfirmation(resource: ResourceResponse) {
    setResourceMessage('')
    setDeletingResourceId(resource.id)

    try {
      await deleteResource(resource.id)
      const loadedResources = await getResources()

      setResources(loadedResources)

      if (currentUser?.role === 'Admin') {
        setAvailabilityRules(await getAvailabilityRules())
      }

      if (editingResourceId === resource.id) {
        resetResourceForm()
      }

      setResourceMessage('Resource deleted.')
    } catch (error) {
      setResourceMessage(getErrorMessage(error))
    } finally {
      setDeletingResourceId(null)
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

  function handleDeleteResource(resource: ResourceResponse) {
    setConfirmationRequest({
      title: 'Delete resource',
      message: `Delete resource "${resource.name}"?`,
      confirmLabel: 'Delete resource',
      onConfirm: () => deleteResourceAfterConfirmation(resource),
    })
  }

  function resetResourceForm() {
    setEditingResourceId(null)
    setResourceName('')
    setResourceDescription('')
    setResourceLocation('')
    setResourceIsActive(true)
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
    setConfirmationRequest({
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
    setAvailabilityRuleStartTime(toTimeInputValue(rule.startTime))
    setAvailabilityRuleEndTime(toTimeInputValue(rule.endTime))
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
    setConfirmationRequest({
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

  function resetLoadedData() {
    setResources([])
    setResourceMessage('')
    setAvailabilities([])
    setAvailabilityMessage('')
    setAvailabilityRules([])
    setAvailabilityRuleMessage('')
    setReservationMessage('')
    resetReservationTimeSelection()
    setReservations([])
    setMyReservationsMessage('')
    setAdminReservations([])
    setAdminReservationsMessage('')
  }

  function handleSelectAvailabilityForReservation(
    availability: AvailabilityResponse,
  ) {
    setSelectedReservationAvailabilityId(availability.id)
    setReservationStartTime(toDateTimeLocalValue(availability.startTime))
    setReservationEndTime(toDateTimeLocalValue(availability.endTime))
    setReservationMessage('')
    setReservationValidationMessage('')
  }

  async function handleCreateReservation(availability: AvailabilityResponse) {
    setReservationMessage('')
    setReservationValidationMessage('')

    const validationMessage = validateReservationTimeSelection(
      availability,
      reservationStartTime,
      reservationEndTime,
    )

    if (validationMessage) {
      setReservationValidationMessage(validationMessage)
      return
    }

    setReservingAvailabilityId(availability.id)

    try {
      await createReservation({
        resourceId: availability.resourceId,
        startTime: reservationStartTime,
        endTime: reservationEndTime,
      })
      const loadedReservations = await getMyReservations()
      const loadedAvailabilities = await getAvailabilities()

      setReservations(loadedReservations)
      setAvailabilities(loadedAvailabilities)
      resetReservationTimeSelection()
      setReservationMessage('Reservation created.')
    } catch (error) {
      setReservationMessage(getErrorMessage(error))
    } finally {
      setReservingAvailabilityId(null)
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

  function resetReservationTimeSelection() {
    setSelectedReservationAvailabilityId(null)
    setReservationStartTime('')
    setReservationEndTime('')
    setReservationValidationMessage('')
  }

  function handleCancelReservation(reservation: ReservationResponse) {
    setConfirmationRequest({
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
    setConfirmationRequest({
      title: 'Cancel reservation',
      message: `Cancel reservation for "${reservation.resourceName}"?`,
      confirmLabel: 'Cancel reservation',
      onConfirm: () => adminCancelReservationAfterConfirmation(reservation),
    })
  }

  async function handleConfirmAction() {
    if (!confirmationRequest) {
      return
    }

    setIsConfirmingAction(true)

    try {
      await confirmationRequest.onConfirm()
      setConfirmationRequest(null)
    } finally {
      setIsConfirmingAction(false)
    }
  }

  function handleCancelConfirmation() {
    if (isConfirmingAction) {
      return
    }

    setConfirmationRequest(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setIsSubmitting(true)

    try {
      if (authMode === 'login') {
        const auth = await login({ email, password })
        saveAuthSession(auth)
        setCurrentUser(auth.user)
        setPassword('')
        setMessage('Login succeeded.')
        return
      }

      await register({ name, email, password })
      setAuthMode('login')
      setName('')
      setPassword('')
      setMessage('Registration succeeded. You can log in now.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleLogout() {
    clearAuthSession()
    resetLoadedData()
    setCurrentUser(null)
    setMessage('You have been logged out.')
  }

  if (currentUser) {
    if (currentUser.role === 'Admin') {
      return (
        <>
          <AdminHomeView
            currentUser={currentUser}
            onLogout={handleLogout}
            resources={resources}
            resourceMessage={resourceMessage}
            isLoadingResources={isLoadingResources}
            resourceName={resourceName}
            setResourceName={setResourceName}
            resourceDescription={resourceDescription}
            setResourceDescription={setResourceDescription}
            resourceLocation={resourceLocation}
            setResourceLocation={setResourceLocation}
            resourceIsActive={resourceIsActive}
            setResourceIsActive={setResourceIsActive}
            editingResourceId={editingResourceId}
            isSavingResource={isSavingResource}
            deletingResourceId={deletingResourceId}
            onSaveResource={handleSaveResource}
            onEditResource={handleEditResource}
            onDeleteResource={handleDeleteResource}
            onCancelResourceEdit={resetResourceForm}
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
          <ConfirmationDialog
            request={confirmationRequest}
            isConfirming={isConfirmingAction}
            onConfirm={() => void handleConfirmAction()}
            onCancel={handleCancelConfirmation}
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
          availabilities={availabilities}
          availabilityMessage={availabilityMessage}
          isLoadingAvailabilities={isLoadingAvailabilities}
          reservations={reservations}
          reservationMessage={reservationMessage}
          reservationValidationMessage={reservationValidationMessage}
          myReservationsMessage={myReservationsMessage}
          isLoadingReservations={isLoadingReservations}
          reservingAvailabilityId={reservingAvailabilityId}
          selectedReservationAvailabilityId={selectedReservationAvailabilityId}
          reservationStartTime={reservationStartTime}
          setReservationStartTime={setReservationStartTime}
          reservationEndTime={reservationEndTime}
          setReservationEndTime={setReservationEndTime}
          cancellingReservationId={cancellingReservationId}
          onReserve={(availability) => void handleCreateReservation(availability)}
          onSelectAvailabilityForReservation={
            handleSelectAvailabilityForReservation
          }
          onCancelReservationTimeSelection={resetReservationTimeSelection}
          onCancelReservation={handleCancelReservation}
          formatDateTime={formatDateTime}
          formatDateTimeInput={toDateTimeLocalValue}
        />
        <ConfirmationDialog
          request={confirmationRequest}
          isConfirming={isConfirmingAction}
          onConfirm={() => void handleConfirmAction()}
          onCancel={handleCancelConfirmation}
        />
      </>
    )
  }

  return (
    <AuthView
      authMode={authMode}
      setAuthMode={setAuthMode}
      name={name}
      setName={setName}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      isSubmitting={isSubmitting}
      message={message}
      onSubmit={handleSubmit}
    />
  )
}

interface ConfirmationDialogProps {
  request: ConfirmationRequest | null
  isConfirming: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmationDialog({
  request,
  isConfirming,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  if (!request) {
    return null
  }

  return (
    <div className="confirm-backdrop" role="presentation">
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h2 id="confirm-dialog-title">{request.title}</h2>
        <p>{request.message}</p>
        <div className="confirm-actions">
          <button type="button" disabled={isConfirming} onClick={onCancel}>
            Keep unchanged
          </button>
          <button type="button" disabled={isConfirming} onClick={onConfirm}>
            {isConfirming ? 'Working...' : request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `Error: ${error.message}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong.'
}

function emptyToNull(value: string) {
  const trimmedValue = value.trim()
  return trimmedValue.length === 0 ? null : trimmedValue
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 16)
}

function toTimeInputValue(value: string) {
  return value.slice(0, 5)
}

function validateAvailabilityForm(
  resourceId: string,
  startTime: string,
  endTime: string,
) {
  if (!resourceId) {
    return 'Select a resource before saving availability.'
  }

  if (!startTime) {
    return 'Enter a start time before saving availability.'
  }

  if (!endTime) {
    return 'Enter an end time before saving availability.'
  }

  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    return 'End time must be after start time.'
  }

  return ''
}

function validateAvailabilityRuleForm(
  resourceId: string,
  dayOfWeek: string,
  startTime: string,
  endTime: string,
) {
  if (!resourceId) {
    return 'Select a resource before saving a weekly schedule.'
  }

  if (!dayOfWeek) {
    return 'Select a weekday before saving a weekly schedule.'
  }

  if (!startTime) {
    return 'Enter a start time before saving a weekly schedule.'
  }

  if (!endTime) {
    return 'Enter an end time before saving a weekly schedule.'
  }

  if (endTime <= startTime) {
    return 'End time must be after start time.'
  }

  return ''
}

function validateReservationTimeSelection(
  availability: AvailabilityResponse,
  startTime: string,
  endTime: string,
) {
  if (!startTime) {
    return 'Select a reservation start time.'
  }

  if (!endTime) {
    return 'Select a reservation end time.'
  }

  const selectedStartTime = new Date(startTime).getTime()
  const selectedEndTime = new Date(endTime).getTime()
  const availabilityStartTime = new Date(availability.startTime).getTime()
  const availabilityEndTime = new Date(availability.endTime).getTime()

  if (Number.isNaN(selectedStartTime) || Number.isNaN(selectedEndTime)) {
    return 'Select valid reservation start and end times.'
  }

  if (selectedEndTime <= selectedStartTime) {
    return 'Reservation end time must be after start time.'
  }

  if (
    selectedStartTime < availabilityStartTime ||
    selectedEndTime > availabilityEndTime
  ) {
    return 'Reservation time must stay inside the selected availability window.'
  }

  return ''
}

export default App
