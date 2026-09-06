import { type FormEvent, useState } from 'react'
import { login, register } from './api/authApi'
import { ApiError } from './api/client'
import type { UserResponse } from './api/types'
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

  return (
    <main className="app-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-copy">
          <h1 id="auth-title">Authentication</h1>
          <p>Login or create a user account.</p>
        </div>

        {currentUser ? (
          <section className="session-summary" aria-label="Current session">
            <div>
              <p className="label-text">Signed in</p>
              <h2>{currentUser.name}</h2>
              <p>{currentUser.email}</p>
            </div>
            <span className="role-badge">{currentUser.role}</span>
            <button type="button" onClick={handleLogout}>
              Logout
            </button>
          </section>
        ) : (
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
        )}

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
