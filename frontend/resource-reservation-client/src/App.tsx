import { type FormEvent, useEffect, useState } from 'react'
import { login, register } from './api/authApi'
import { ApiError } from './api/client'
import { getResources } from './api/resourcesApi'
import type { ResourceResponse, UserResponse } from './api/types'
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

  useEffect(() => {
    if (!currentUser) {
      setResources([])
      setResourceMessage('')
      return
    }

    let shouldUpdate = true

    async function loadResources() {
      setIsLoadingResources(true)
      setResourceMessage('')

      try {
        const loadedResources = await getResources()

        if (shouldUpdate) {
          setResources(loadedResources)
        }
      } catch (error) {
        if (shouldUpdate) {
          setResourceMessage(getErrorMessage(error))
        }
      } finally {
        if (shouldUpdate) {
          setIsLoadingResources(false)
        }
      }
    }

    void loadResources()

    return () => {
      shouldUpdate = false
    }
  }, [currentUser])

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
                    <span>{resource.isActive ? 'Active' : 'Inactive'}</span>
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

export default App
