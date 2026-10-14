import { useRef, useState, type FormEvent } from 'react'
import type { AcceptedMessage } from '../api/types'
import { getFormErrors, hasFieldErrors, type FieldErrors } from '../lib/errors'
import { validateEmailForm } from '../lib/validation'
import { Alert, type Notice } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { useFocusFirstInvalid } from '../ui/useFocusFirstInvalid'
import { AccountPageLayout } from './AccountPageLayout'

interface EmailRequestPageProps {
  title: string
  description: string
  submitLabel: string
  send: (email: string) => Promise<AcceptedMessage>
}

// Asks for an email to be sent to an address. The API answers the same for
// every address, so the page shows that answer and never says whether the
// address has an account.
export function EmailRequestPage({ title, description, submitLabel, send }: EmailRequestPageProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [email, setEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<'email'>>({})
  const [notice, setNotice] = useState<Notice | null>(null)
  const [isSending, setIsSending] = useState(false)

  useFocusFirstInvalid(formRef, fieldErrors)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)

    const validationErrors = validateEmailForm(email)
    setFieldErrors(validationErrors)

    if (hasFieldErrors(validationErrors)) {
      return
    }

    setIsSending(true)

    try {
      const answer = await send(email.trim())
      setNotice({ tone: 'success', text: answer.message })
    } catch (error) {
      const formErrors = getFormErrors(error, ['email'] as const)
      setFieldErrors(formErrors.fieldErrors)
      setNotice({ tone: 'danger', text: formErrors.message })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <AccountPageLayout title={title} description={description}>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <form ref={formRef} className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
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
        <Button type="submit" variant="primary" className="auth-submit" disabled={isSending}>
          {isSending ? 'Sending...' : submitLabel}
        </Button>
      </form>
    </AccountPageLayout>
  )
}
