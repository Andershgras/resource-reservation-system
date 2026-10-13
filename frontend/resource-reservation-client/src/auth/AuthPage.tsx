import { useRef, useState, type FormEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { register } from '../api/authApi'
import { getFormErrors, hasFieldErrors, type FieldErrors } from '../lib/errors'
import { validateAuthForm, type AuthField } from '../lib/validation'
import { Alert, type Notice } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { useFocusFirstInvalid } from '../ui/useFocusFirstInvalid'
import { useAuth, type SessionEnd } from './authContext'
import './AuthPage.css'

type AuthMode = 'login' | 'register'

const authFields: readonly AuthField[] = ['name', 'email', 'password']

const sessionEndNotices: Record<NonNullable<SessionEnd>, Notice> = {
  expired: { tone: 'warning', text: 'Your session has expired. Please log in again.' },
  loggedOut: { tone: 'info', text: 'You have been logged out.' },
}

const highlights = [
  'See open times for each resource at a glance',
  'Book without clashing with anyone else',
  'Manage resources and opening hours in one place',
]

// The login and registration screens, at /login and /register. A returnTo
// parameter is kept when switching between them. After logging in,
// RequireLoggedOut moves on to returnTo or the user's home.
export function AuthPage() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { logIn, sessionEnd, clearSessionEnd } = useAuth()
  const authMode: AuthMode = pathname === '/register' ? 'register' : 'login'
  const formRef = useRef<HTMLFormElement>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<AuthField>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const shownNotice = notice ?? (sessionEnd ? sessionEndNotices[sessionEnd] : null)

  useFocusFirstInvalid(formRef, fieldErrors)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    clearSessionEnd()

    const validationErrors = validateAuthForm(authMode, name, email, password)
    setFieldErrors(validationErrors)

    if (hasFieldErrors(validationErrors)) {
      return
    }

    setIsSubmitting(true)

    try {
      if (authMode === 'login') {
        await logIn({ email, password })
        return
      }

      await register({ name, email, password })
      setName('')
      setPassword('')
      setNotice({ tone: 'success', text: 'Registration succeeded. You can log in now.' })
      navigate({ pathname: '/login', search })
    } catch (error) {
      const formErrors = getFormErrors(error, authFields)
      setFieldErrors(formErrors.fieldErrors)
      setNotice({ tone: 'danger', text: formErrors.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  function switchMode() {
    setNotice(null)
    setFieldErrors({})
  }

  return (
    <main id="main-content" className="auth-page" tabIndex={-1}>
      <div className="auth-panel">
        <section className="auth-brand" aria-label="About Resource Reservation">
          <p className="auth-logo">
            <span className="auth-logo-mark" aria-hidden="true">RR</span>
            Resource Reservation
          </p>
          <div className="auth-pitch">
            <p className="auth-pitch-title">Shared rooms, desks and equipment, booked in seconds.</p>
            <ul className="auth-highlights">
              {highlights.map((highlight) => (
                <li key={highlight}>
                  <CheckIcon />
                  {highlight}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="auth-form-area">
          <nav className="auth-mode-switch" aria-label="Sign in or register">
            <NavLink to={{ pathname: '/login', search }} onClick={switchMode} end>
              Login
            </NavLink>
            <NavLink to={{ pathname: '/register', search }} onClick={switchMode} end>
              Register
            </NavLink>
          </nav>

          <div className="auth-heading">
            <h1>{authMode === 'login' ? 'Sign in' : 'Create account'}</h1>
            <p>
              {authMode === 'login'
                ? 'Welcome back. Sign in to book or manage resources.'
                : 'Create an account to start booking.'}
            </p>
          </div>

          {shownNotice && <Alert tone={shownNotice.tone}>{shownNotice.text}</Alert>}

          <form ref={formRef} className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
            {authMode === 'register' && (
              <Field label="Name" error={fieldErrors.name}>
                {(props) => (
                  <Input
                    {...props}
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={100}
                    required
                  />
                )}
              </Field>
            )}

            <Field label="Email" error={fieldErrors.email}>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={255}
                  required
                />
              )}
            </Field>

            <Field
              label="Password"
              hint={authMode === 'register' ? 'At least 8 characters, including a number.' : undefined}
              error={fieldErrors.password}
            >
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  maxLength={100}
                  required
                />
              )}
            </Field>

            <Button type="submit" variant="primary" className="auth-submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Please wait...'
                : authMode === 'login'
                  ? 'Login'
                  : 'Create account'}
            </Button>
          </form>
        </div>
      </div>
    </main>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.1 4.4a.8.8 0 0 0-1.1.1L7.2 8.9 6 7.7a.8.8 0 1 0-1.1 1.1l1.8 1.8a.8.8 0 0 0 1.2-.1l3.3-4a.8.8 0 0 0-.1-1.1Z"
      />
    </svg>
  )
}
