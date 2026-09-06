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
      <div className="auth-copy">
        <h1 id="auth-title">Authentication</h1>
        <p>Login or create a user account.</p>
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
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
