import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { AuthForm, type AuthMode } from '../components/AuthForm'

interface AuthViewProps {
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

export function AuthView({
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
}: AuthViewProps) {
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
        onSubmit={onSubmit}
      />
    </main>
  )
}
