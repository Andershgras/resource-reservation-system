import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { verifyEmail } from '../api/authApi'
import { getErrorMessage, hasFieldErrors, type FieldErrors } from '../lib/errors'
import { Alert } from '../ui/Alert'
import { Button, ButtonLink } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { useFocusFirstInvalid } from '../ui/useFocusFirstInvalid'
import { AccountPageLayout } from './AccountPageLayout'
import { useLinkToken } from './useLinkToken'

// /verify-email#token=…, opened from the verification email. The account's
// password is asked for as well, so a link sent to someone who didn't create
// the account can't activate it. Nothing is sent until the form is submitted,
// so a mail scanner opening the link can't use it up.
export function VerifyEmailPage() {
  const token = useLinkToken()
  const formRef = useRef<HTMLFormElement>(null)
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<'password'>>({})
  const [error, setError] = useState('')
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [isSending, setIsSending] = useState(false)

  useFocusFirstInvalid(formRef, fieldErrors)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const validationErrors: FieldErrors<'password'> = password ? {} : { password: 'Enter your password.' }
    setFieldErrors(validationErrors)

    if (hasFieldErrors(validationErrors) || !token) {
      return
    }

    setIsSending(true)

    try {
      await verifyEmail(token, password)
      setIsConfirmed(true)
    } catch (verifyError) {
      setError(getErrorMessage(verifyError))
    } finally {
      setIsSending(false)
    }
  }

  if (!token) {
    return (
      <AccountPageLayout title="Confirm your email" description="This link is incomplete.">
        <Alert tone="danger">Open the link from the email again, or ask for a new one.</Alert>
        <ButtonLink to="/resend-verification" variant="primary">Send a new link</ButtonLink>
      </AccountPageLayout>
    )
  }

  if (isConfirmed) {
    return (
      <AccountPageLayout title="Email confirmed" description="Your account is ready.">
        <Alert tone="success">Your email address is confirmed. You can sign in now.</Alert>
        <ButtonLink to="/login" variant="primary">Sign in</ButtonLink>
      </AccountPageLayout>
    )
  }

  return (
    <AccountPageLayout
      title="Confirm your email"
      description="Enter the password you chose when you created the account."
    >
      {error && (
        <Alert tone="danger">
          {error} <Link to="/resend-verification">Send a new link</Link>
        </Alert>
      )}
      <form ref={formRef} className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Field label="Password" error={fieldErrors.password}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={100}
              required
            />
          )}
        </Field>
        <Button type="submit" variant="primary" className="auth-submit" disabled={isSending}>
          {isSending ? 'Confirming...' : 'Confirm email'}
        </Button>
      </form>
    </AccountPageLayout>
  )
}
