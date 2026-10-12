import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { register } from '../api/authApi'
import { AuthForm, type AuthMode } from '../components/AuthForm'
import { getErrorMessage } from '../lib/errors'
import { useAuth, type SessionEnd } from './authContext'

const sessionEndMessages: Record<NonNullable<SessionEnd>, string> = {
  expired: 'Your session has expired. Please log in again.',
  loggedOut: 'You have been logged out.',
}

// The login and registration screens, at /login and /register. A returnTo
// parameter is kept when switching between them. After logging in,
// RequireLoggedOut moves on to returnTo or the user's home.
export function AuthPage() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { logIn, sessionEnd, clearSessionEnd } = useAuth()
  const authMode: AuthMode = pathname === '/register' ? 'register' : 'login'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleModeChange(mode: AuthMode) {
    navigate({ pathname: mode === 'login' ? '/login' : '/register', search })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    clearSessionEnd()
    setIsSubmitting(true)

    try {
      if (authMode === 'login') {
        await logIn({ email, password })
        return
      }

      await register({ name, email, password })
      setName('')
      setPassword('')
      setMessage('Registration succeeded. You can log in now.')
      navigate({ pathname: '/login', search })
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="app-shell">
      <AuthForm
        authMode={authMode}
        onModeChange={handleModeChange}
        name={name}
        setName={setName}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        isSubmitting={isSubmitting}
        message={message || (sessionEnd ? sessionEndMessages[sessionEnd] : '')}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
