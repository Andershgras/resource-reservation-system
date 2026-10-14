import { useEffect, useRef, useState, type FormEvent } from 'react'
import { checkPasswordReset, resetPassword } from '../api/authApi'
import { getFormErrors, hasFieldErrors, type FieldErrors } from '../lib/errors'
import { validateResetPasswordForm, type ResetPasswordField } from '../lib/validation'
import { Alert } from '../ui/Alert'
import { Button, ButtonLink } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { LoadingState } from '../ui/States'
import { useFocusFirstInvalid } from '../ui/useFocusFirstInvalid'
import { AccountPageLayout } from './AccountPageLayout'
import { useLinkToken } from './useLinkToken'

const resetFields: readonly ResetPasswordField[] = ['name', 'password', 'confirmPassword']

type LinkState =
  | { status: 'checking' }
  | { status: 'invalid'; message: string }
  | { status: 'valid'; completesRegistration: boolean }
  | { status: 'done' }

// /reset-password#token=…, opened from the reset email. The link is checked
// first, without using it up, so an expired link says so before anything is
// typed. A reset of an account that was never confirmed sets it up again, so
// the page also asks for a name (ADR 0011).
export function ResetPasswordPage() {
  const token = useLinkToken()
  const formRef = useRef<HTMLFormElement>(null)
  const [linkState, setLinkState] = useState<LinkState>(token
    ? { status: 'checking' }
    : { status: 'invalid', message: 'This link is incomplete. Open the link from the email again.' })
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ResetPasswordField>>({})
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)

  useFocusFirstInvalid(formRef, fieldErrors)

  useEffect(() => {
    if (!token) {
      return
    }

    let isCurrent = true

    checkPasswordReset(token).then(
      (status) => isCurrent && setLinkState({ status: 'valid', completesRegistration: status.completesRegistration }),
      (checkError: unknown) => isCurrent && setLinkState({
        status: 'invalid',
        message: checkError instanceof Error ? checkError.message : 'This link doesn\'t work.',
      }),
    )

    return () => {
      isCurrent = false
    }
  }, [token])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (linkState.status !== 'valid' || !token) {
      return
    }

    const validationErrors = validateResetPasswordForm(
      linkState.completesRegistration,
      name,
      password,
      confirmPassword,
    )
    setFieldErrors(validationErrors)

    if (hasFieldErrors(validationErrors)) {
      return
    }

    setIsSending(true)

    try {
      await resetPassword({
        token,
        password,
        name: linkState.completesRegistration ? name.trim() : undefined,
      })
      setLinkState({ status: 'done' })
    } catch (resetError) {
      const formErrors = getFormErrors(resetError, resetFields)
      setFieldErrors(formErrors.fieldErrors)
      setError(formErrors.message)
    } finally {
      setIsSending(false)
    }
  }

  if (linkState.status === 'checking') {
    return (
      <AccountPageLayout title="Choose a new password" description="Checking your link.">
        <LoadingState>Checking the link...</LoadingState>
      </AccountPageLayout>
    )
  }

  if (linkState.status === 'invalid') {
    return (
      <AccountPageLayout title="Choose a new password" description="This link can't be used.">
        <Alert tone="danger">{linkState.message}</Alert>
        <ButtonLink to="/forgot-password" variant="primary">Ask for a new link</ButtonLink>
      </AccountPageLayout>
    )
  }

  if (linkState.status === 'done') {
    return (
      <AccountPageLayout title="Password changed" description="Every device that was signed in has been signed out.">
        <Alert tone="success">Your new password is set. Sign in with it now.</Alert>
        <ButtonLink to="/login" variant="primary">Sign in</ButtonLink>
      </AccountPageLayout>
    )
  }

  return (
    <AccountPageLayout
      title={linkState.completesRegistration ? 'Set up your account' : 'Choose a new password'}
      description={linkState.completesRegistration
        ? "This account wasn't confirmed yet. Choose its name and password; anything entered when it was created is replaced."
        : 'Every device signed in to your account will be signed out.'}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <form ref={formRef} className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {linkState.completesRegistration && (
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
        <Field label="New password" hint="At least 8 characters." error={fieldErrors.password}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={100}
              required
            />
          )}
        </Field>
        <Field label="Repeat the new password" error={fieldErrors.confirmPassword}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              maxLength={100}
              required
            />
          )}
        </Field>
        <Button type="submit" variant="primary" className="auth-submit" disabled={isSending}>
          {isSending ? 'Saving...' : 'Set new password'}
        </Button>
      </form>
    </AccountPageLayout>
  )
}
