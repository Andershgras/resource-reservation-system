import type { Dispatch, FormEvent, SetStateAction } from 'react'

export type AuthMode = 'login' | 'register'

interface AuthFormProps {
  authMode: AuthMode
  setAuthMode: Dispatch<SetStateAction<AuthMode>>
  name: string
  setName: Dispatch<SetStateAction<string>>
  email: string
  setEmail: Dispatch<SetStateAction<string>>
  password: string
  setPassword: Dispatch<SetStateAction<string>>
  isSubmitting: boolean
  message: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function AuthForm({
  authMode,
  setAuthMode,
  name,
  setName,
  email,
  setEmail,
  password,
  setPassword,
  isSubmitting,
  message,
  onSubmit,
}: AuthFormProps) {
  return (
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-brand">
        <div className="app-mark" aria-hidden="true">
          RR
        </div>
        <div className="auth-copy">
          <p className="eyebrow">Portfolio booking app</p>
          <h1 id="auth-title">Resource Reservation</h1>
          <p>Clean scheduling for shared rooms, equipment, and bookable resources.</p>
        </div>
        <div className="auth-highlights" aria-label="Project highlights">
          <span>JWT auth</span>
          <span>Role-based views</span>
          <span>Reservation rules</span>
        </div>
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{authMode === 'login' ? 'Welcome back' : 'New account'}</p>
            <h2>{authMode === 'login' ? 'Sign in' : 'Create account'}</h2>
          </div>
        </div>

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
  )
}
