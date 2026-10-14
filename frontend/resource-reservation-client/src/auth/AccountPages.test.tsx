import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../api/authApi'
import { ApiError } from '../api/client'
import { expectNoAxeViolations } from '../test/axe'
import { EmailRequestPage } from './EmailRequestPage'
import { ResetPasswordPage } from './ResetPasswordPage'
import { VerifyEmailPage } from './VerifyEmailPage'

vi.mock('../api/authApi')

const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde'
const invalidLink = "This link doesn't work. It may have expired or been used already. Ask for a new one."

function renderAt(url: string, path: string, page: ReactNode) {
  const router = createMemoryRouter(
    [
      { path, element: page },
      { path: '/login', element: <h1>Login screen</h1> },
      { path: '/forgot-password', element: <h1>Forgot password</h1> },
      { path: '/resend-verification', element: <h1>Resend verification</h1> },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)

  return router
}

beforeEach(() => {
  vi.mocked(authApi.verifyEmail).mockResolvedValue(undefined)
  vi.mocked(authApi.checkPasswordReset).mockResolvedValue({ completesRegistration: false })
  vi.mocked(authApi.resetPassword).mockResolvedValue(undefined)
})

describe('VerifyEmailPage', () => {
  it('removes the token from the address at once, and sends it only with the password', async () => {
    const router = renderAt(`/verify-email#token=${token}`, '/verify-email', <VerifyEmailPage />)

    expect(router.state.location.hash).toBe('')
    expect(router.state.location.pathname).toBe('/verify-email')
    expect(authApi.verifyEmail).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Password'), 'Password1')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }))

    expect(authApi.verifyEmail).toHaveBeenCalledWith(token, 'Password1')
    expect(await screen.findByRole('heading', { name: 'Email confirmed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('asks for the password first', async () => {
    renderAt(`/verify-email#token=${token}`, '/verify-email', <VerifyEmailPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }))

    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.')
    expect(authApi.verifyEmail).not.toHaveBeenCalled()
  })

  it("shows the API's refusal, with a way to get a new link", async () => {
    vi.mocked(authApi.verifyEmail).mockRejectedValue(new ApiError(invalidLink, 400))
    renderAt(`/verify-email#token=${token}`, '/verify-email', <VerifyEmailPage />)

    await userEvent.type(screen.getByLabelText('Password'), 'Password1')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(invalidLink)
    expect(screen.getByRole('link', { name: 'Send a new link' })).toHaveAttribute('href', '/resend-verification')
  })

  it('says when the link has no token', () => {
    renderAt('/verify-email', '/verify-email', <VerifyEmailPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('Open the link from the email again')
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    renderAt(`/verify-email#token=${token}`, '/verify-email', <VerifyEmailPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }))

    await expectNoAxeViolations(document.body)
  })
})

describe('ResetPasswordPage', () => {
  it('checks the link, then sets the new password', async () => {
    const router = renderAt(`/reset-password#token=${token}`, '/reset-password', <ResetPasswordPage />)

    expect(router.state.location.hash).toBe('')
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(authApi.checkPasswordReset).toHaveBeenCalledWith(token)
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()

    await userEvent.type(await screen.findByLabelText('New password'), 'NewPassword1')
    await userEvent.type(screen.getByLabelText('Repeat the new password'), 'NewPassword1')
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(authApi.resetPassword).toHaveBeenCalledWith({ token, password: 'NewPassword1', name: undefined })
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument()
  })

  it('checks the fields before sending them', async () => {
    renderAt(`/reset-password#token=${token}`, '/reset-password', <ResetPasswordPage />)

    await userEvent.type(await screen.findByLabelText('New password'), 'short')
    await userEvent.type(screen.getByLabelText('Repeat the new password'), 'different')
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
      'At least 8 characters. Password must be at least 8 characters.',
    )
    expect(screen.getByLabelText('Repeat the new password')).toHaveAccessibleDescription("The passwords don't match.")
    expect(authApi.resetPassword).not.toHaveBeenCalled()
  })

  it('asks for a name when the reset sets up an unconfirmed account again', async () => {
    vi.mocked(authApi.checkPasswordReset).mockResolvedValue({ completesRegistration: true })
    renderAt(`/reset-password#token=${token}`, '/reset-password', <ResetPasswordPage />)

    expect(await screen.findByRole('heading', { name: 'Set up your account' })).toBeInTheDocument()
    expect(screen.getByText(/anything entered when it was created is replaced/)).toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), ' Ada ')
    await userEvent.type(screen.getByLabelText('New password'), 'NewPassword1')
    await userEvent.type(screen.getByLabelText('Repeat the new password'), 'NewPassword1')
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(authApi.resetPassword).toHaveBeenCalledWith({ token, password: 'NewPassword1', name: 'Ada' })
  })

  it('says when the link no longer works, before anything is typed', async () => {
    vi.mocked(authApi.checkPasswordReset).mockRejectedValue(new ApiError(invalidLink, 400))
    renderAt(`/reset-password#token=${token}`, '/reset-password', <ResetPasswordPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(invalidLink)
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('has no accessibility violations', async () => {
    vi.mocked(authApi.checkPasswordReset).mockResolvedValue({ completesRegistration: true })
    renderAt(`/reset-password#token=${token}`, '/reset-password', <ResetPasswordPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Set new password' }))

    await expectNoAxeViolations(document.body)
  })
})

describe('EmailRequestPage', () => {
  function renderRequestPage(send: (email: string) => Promise<{ message: string }>) {
    return renderAt('/forgot-password', '/forgot-password', (
      <EmailRequestPage
        title="Forgot your password?"
        description="We'll send you a link."
        submitLabel="Send reset link"
        send={send}
      />
    ))
  }

  it("shows the API's answer, which is the same for every address", async () => {
    const send = vi.fn().mockResolvedValue({ message: "If that address has an account, we've sent it a link." })
    renderRequestPage(send)

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), ' ada@example.com ')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(send).toHaveBeenCalledWith('ada@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent("If that address has an account, we've sent it a link.")
  })

  it('checks the address before sending it', async () => {
    const send = vi.fn()
    renderRequestPage(send)

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription('Enter a valid email address.')
    expect(send).not.toHaveBeenCalled()
  })

  it('shows the rate limit message', async () => {
    renderRequestPage(vi.fn().mockRejectedValue(new ApiError('Too many attempts. Please wait a moment and try again.', 429)))

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.')
  })

  it('has no accessibility violations', async () => {
    renderRequestPage(vi.fn())
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    await expectNoAxeViolations(document.body)
  })
})
