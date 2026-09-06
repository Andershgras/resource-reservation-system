import { type FormEvent, useEffect, useState } from 'react'
import { getAvailabilities } from './api/availabilitiesApi'
import { login, register } from './api/authApi'
import { ApiError } from './api/client'
import {
  createResource,
  deleteResource,
  getResources,
  updateResource,
} from './api/resourcesApi'
import type {
  AvailabilityResponse,
  ResourceResponse,
  UserResponse,
} from './api/types'
import {
  clearAuthSession,
  getAuthUser,
  saveAuthSession,
} from './auth/authStorage'
import './App.css'

type AuthMode = 'login' | 'register'

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

  useEffect(() => {
    if (!currentUser) {
      setResources([])
      setResourceMessage('')
      setAvailabilities([])
      setAvailabilityMessage('')
      return
    }

    let isActive = true

    void loadResources(() => isActive)
    void loadAvailabilities(() => isActive)

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
        <section className="home-panel" aria-labelledby="home-title">
          <header className="home-header">
            <div>
              <p className="label-text">Signed in as {currentUser.role}</p>
              <h1 id="home-title">{currentUser.name}</h1>
              <p>{currentUser.email}</p>
            </div>
            <button type="button" onClick={handleLogout}>
              Logout
            </button>
          </header>

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
            <section
              className="placeholder-section"
              aria-labelledby="create-resource-title"
            >
              <h2 id="create-resource-title">
                {editingResourceId ? 'Edit resource' : 'Create resource'}
              </h2>
              <form className="resource-form" onSubmit={handleSaveResource}>
                <label>
                  Name
                  <input
                    type="text"
                    value={resourceName}
                    onChange={(event) => setResourceName(event.target.value)}
                    maxLength={100}
                    required
                  />
                </label>

                <label>
                  Description
                  <input
                    type="text"
                    value={resourceDescription}
                    onChange={(event) =>
                      setResourceDescription(event.target.value)
                    }
                    maxLength={500}
                  />
                </label>

                <label>
                  Location
                  <input
                    type="text"
                    value={resourceLocation}
                    onChange={(event) => setResourceLocation(event.target.value)}
                    maxLength={200}
                  />
                </label>

                {editingResourceId && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={resourceIsActive}
                      onChange={(event) =>
                        setResourceIsActive(event.target.checked)
                      }
                    />
                    Active
                  </label>
                )}

                <button type="submit" disabled={isSavingResource}>
                  {isSavingResource
                    ? 'Saving...'
                    : editingResourceId
                      ? 'Save resource'
                      : 'Create resource'}
                </button>
                {editingResourceId && (
                  <button type="button" onClick={resetResourceForm}>
                    Cancel edit
                  </button>
                )}
              </form>
            </section>
          )}

          <section className="placeholder-section" aria-labelledby="resources-title">
            <h2 id="resources-title">Resources</h2>
            {isLoadingResources && <p>Loading resources...</p>}
            {resourceMessage && <p className="status-message">{resourceMessage}</p>}
            {!isLoadingResources && !resourceMessage && resources.length === 0 && (
              <p>No resources found.</p>
            )}
            {resources.length > 0 && (
              <ul className="resource-list">
                {resources.map((resource) => (
                  <li key={resource.id}>
                    <div>
                      <strong>{resource.name}</strong>
                      {resource.location && <p>{resource.location}</p>}
                      {resource.description && <p>{resource.description}</p>}
                    </div>
                    <div className="resource-actions">
                      <span>{resource.isActive ? 'Active' : 'Inactive'}</span>
                      {currentUser.role === 'Admin' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEditResource(resource)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={deletingResourceId === resource.id}
                            onClick={() => void handleDeleteResource(resource)}
                          >
                            {deletingResourceId === resource.id
                              ? 'Deleting...'
                              : 'Delete'}
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="placeholder-section"
            aria-labelledby="availabilities-title"
          >
            <h2 id="availabilities-title">Availability</h2>
            {isLoadingAvailabilities && <p>Loading availability...</p>}
            {availabilityMessage && (
              <p className="status-message">{availabilityMessage}</p>
            )}
            {!isLoadingAvailabilities &&
              !availabilityMessage &&
              availabilities.length === 0 && <p>No availability found.</p>}
            {availabilities.length > 0 && (
              <ul className="resource-list">
                {availabilities.map((availability) => (
                  <li key={availability.id}>
                    <div>
                      <strong>{availability.resourceName}</strong>
                      <p>{formatDateTime(availability.startTime)}</p>
                      <p>{formatDateTime(availability.endTime)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-copy">
          <h1 id="auth-title">Authentication</h1>
          <p>Login or create a user account.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="mode-switch" aria-label="Authentication mode">
            <button
              type="button"
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => setAuthMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'active' : ''}
              onClick={() => setAuthMode('register')}
            >
              Register
            </button>
          </div>

          {authMode === 'register' && (
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={255}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={authMode === 'register' ? 8 : undefined}
              maxLength={100}
              required
            />
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Please wait...'
              : authMode === 'login'
                ? 'Login'
                : 'Create account'}
          </button>
        </form>

        {message && <p className="status-message">{message}</p>}
      </section>
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

export default App
