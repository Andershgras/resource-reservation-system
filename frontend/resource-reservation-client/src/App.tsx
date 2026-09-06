import { type FormEvent, useEffect, useState } from 'react'
import {
  createAvailability,
  deleteAvailability,
  getAvailabilities,
  updateAvailability,
} from './api/availabilitiesApi'
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
  const [reservingAvailabilityId, setReservingAvailabilityId] = useState<
    number | null
  >(null)
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

  useEffect(() => {
    if (!currentUser) {
      setResources([])
      setResourceMessage('')
      setAvailabilities([])
      setAvailabilityMessage('')
      setReservationMessage('')
      setReservations([])
      setMyReservationsMessage('')
      setAdminReservations([])
      setAdminReservationsMessage('')
      return
    }

    let isActive = true

    void loadResources(() => isActive)
    void loadAvailabilities(() => isActive)

    if (currentUser.role === 'User') {
      void loadMyReservations(() => isActive)
    }

    if (currentUser.role === 'Admin') {
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

  async function handleDeleteResource(resource: ResourceResponse) {
    const shouldDelete = confirm(`Delete resource "${resource.name}"?`)

    if (!shouldDelete) {
      return
    }

    setResourceMessage('')
    setDeletingResourceId(resource.id)

    try {
      await deleteResource(resource.id)
      const loadedResources = await getResources()

      setResources(loadedResources)

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

  async function handleDeleteAvailability(availability: AvailabilityResponse) {
    const shouldDelete = confirm(
      `Delete availability for "${availability.resourceName}"?`,
    )

    if (!shouldDelete) {
      return
    }

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

  function resetAvailabilityForm() {
    setEditingAvailabilityId(null)
    setAvailabilityResourceId('')
    setAvailabilityStartTime('')
    setAvailabilityEndTime('')
    setAvailabilityValidationMessage('')
  }

  async function handleCreateReservation(availability: AvailabilityResponse) {
    setReservationMessage('')
    setReservingAvailabilityId(availability.id)

    try {
      await createReservation({
        resourceId: availability.resourceId,
        startTime: availability.startTime,
        endTime: availability.endTime,
      })
      const loadedReservations = await getMyReservations()
      const loadedAvailabilities = await getAvailabilities()

      setReservations(loadedReservations)
      setAvailabilities(loadedAvailabilities)
      setReservationMessage('Reservation created.')
    } catch (error) {
      setReservationMessage(getErrorMessage(error))
    } finally {
      setReservingAvailabilityId(null)
    }
  }

  async function handleCancelReservation(reservation: ReservationResponse) {
    const shouldCancel = confirm(
      `Cancel reservation for "${reservation.resourceName}"?`,
    )

    if (!shouldCancel) {
      return
    }

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

  async function handleAdminCancelReservation(reservation: ReservationResponse) {
    const shouldCancel = confirm(
      `Cancel reservation for "${reservation.resourceName}"?`,
    )

    if (!shouldCancel) {
      return
    }

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
    setCurrentUser(null)
    setMessage('You have been logged out.')
  }

  if (currentUser) {
    if (currentUser.role === 'Admin') {
      return (
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
          onDeleteResource={(resource) => void handleDeleteResource(resource)}
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
          onDeleteAvailability={(availability) =>
            void handleDeleteAvailability(availability)
          }
          onCancelAvailabilityEdit={resetAvailabilityForm}
          adminReservations={adminReservations}
          adminReservationsMessage={adminReservationsMessage}
          isLoadingAdminReservations={isLoadingAdminReservations}
          adminCancellingReservationId={adminCancellingReservationId}
          onAdminCancelReservation={(reservation) =>
            void handleAdminCancelReservation(reservation)
          }
          formatDateTime={formatDateTime}
          hasActiveReservationOverlap={hasActiveReservationOverlap}
        />
      )
    }

    return (
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
        myReservationsMessage={myReservationsMessage}
        isLoadingReservations={isLoadingReservations}
        reservingAvailabilityId={reservingAvailabilityId}
        cancellingReservationId={cancellingReservationId}
        onReserve={(availability) => void handleCreateReservation(availability)}
        onCancelReservation={(reservation) =>
          void handleCancelReservation(reservation)
        }
        formatDateTime={formatDateTime}
        hasActiveReservationOverlap={hasActiveReservationOverlap}
      />
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

function hasActiveReservationOverlap(
  availability: AvailabilityResponse,
  reservations: ReservationResponse[],
) {
  const availabilityStart = new Date(availability.startTime).getTime()
  const availabilityEnd = new Date(availability.endTime).getTime()

  return reservations.some((reservation) => {
    if (
      reservation.status !== 'Active' ||
      reservation.resourceId !== availability.resourceId
    ) {
      return false
    }

    const reservationStart = new Date(reservation.startTime).getTime()
    const reservationEnd = new Date(reservation.endTime).getTime()

    return availabilityStart < reservationEnd && availabilityEnd > reservationStart
  })
}

export default App
