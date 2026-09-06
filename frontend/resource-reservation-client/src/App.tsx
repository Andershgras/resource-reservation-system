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
import { AuthForm, type AuthMode } from './components/AuthForm'
import { AvailabilityFormSection } from './components/AvailabilityFormSection'
import { AvailabilitySection } from './components/AvailabilitySection'
import { HomeHeader } from './components/HomeHeader'
import { ReservationsSection } from './components/ReservationsSection'
import { ResourceFormSection } from './components/ResourceFormSection'
import { ResourcesSection } from './components/ResourcesSection'
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
    return (
      <main className="app-shell">
        <section className="home-panel">
          <HomeHeader currentUser={currentUser} onLogout={handleLogout} />

          {currentUser.role === 'Admin' ? (
            <section className="placeholder-section" aria-labelledby="admin-title">
              <h2 id="admin-title">Admin home</h2>
              <p>Resource and availability management will be added here.</p>
            </section>
          ) : (
            <section className="placeholder-section" aria-labelledby="user-title">
              <h2 id="user-title">User home</h2>
              <p>Resource browsing and reservations will be added here.</p>
            </section>
          )}

          {currentUser.role === 'Admin' && (
            <ResourceFormSection
              editingResourceId={editingResourceId}
              resourceName={resourceName}
              setResourceName={setResourceName}
              resourceDescription={resourceDescription}
              setResourceDescription={setResourceDescription}
              resourceLocation={resourceLocation}
              setResourceLocation={setResourceLocation}
              resourceIsActive={resourceIsActive}
              setResourceIsActive={setResourceIsActive}
              isSavingResource={isSavingResource}
              onSubmit={handleSaveResource}
              onCancelEdit={resetResourceForm}
            />
          )}

          {currentUser.role === 'Admin' && (
            <AvailabilityFormSection
              editingAvailabilityId={editingAvailabilityId}
              resources={resources}
              availabilityResourceId={availabilityResourceId}
              setAvailabilityResourceId={setAvailabilityResourceId}
              availabilityStartTime={availabilityStartTime}
              setAvailabilityStartTime={setAvailabilityStartTime}
              availabilityEndTime={availabilityEndTime}
              setAvailabilityEndTime={setAvailabilityEndTime}
              isSavingAvailability={isSavingAvailability}
              onSubmit={handleSaveAvailability}
              onCancelEdit={resetAvailabilityForm}
            />
          )}

          <ResourcesSection
            currentUserRole={currentUser.role}
            resources={resources}
            isLoadingResources={isLoadingResources}
            resourceMessage={resourceMessage}
            deletingResourceId={deletingResourceId}
            onEditResource={handleEditResource}
            onDeleteResource={(resource) => void handleDeleteResource(resource)}
          />

          <AvailabilitySection
            currentUserRole={currentUser.role}
            availabilities={availabilities}
            reservations={reservations}
            isLoadingAvailabilities={isLoadingAvailabilities}
            availabilityMessage={availabilityMessage}
            reservationMessage={reservationMessage}
            reservingAvailabilityId={reservingAvailabilityId}
            deletingAvailabilityId={deletingAvailabilityId}
            onReserve={(availability) => void handleCreateReservation(availability)}
            onEditAvailability={handleEditAvailability}
            onDeleteAvailability={(availability) =>
              void handleDeleteAvailability(availability)
            }
            formatDateTime={formatDateTime}
            hasActiveReservationOverlap={hasActiveReservationOverlap}
          />

          {currentUser.role === 'User' && (
            <ReservationsSection
              title="My reservations"
              reservations={reservations}
              isLoading={isLoadingReservations}
              message={myReservationsMessage}
              cancellingReservationId={cancellingReservationId}
              onCancelReservation={(reservation) =>
                void handleCancelReservation(reservation)
              }
              formatDateTime={formatDateTime}
            />
          )}

          {currentUser.role === 'Admin' && (
            <ReservationsSection
              title="Reservations"
              reservations={adminReservations}
              isLoading={isLoadingAdminReservations}
              message={adminReservationsMessage}
              showUserId
              cancellingReservationId={adminCancellingReservationId}
              onCancelReservation={(reservation) =>
                void handleAdminCancelReservation(reservation)
              }
              formatDateTime={formatDateTime}
            />
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <AuthForm
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
    </main>
  )
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message
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
