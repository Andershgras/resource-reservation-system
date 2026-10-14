import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import * as authApi from '../api/authApi'
import { ApiError } from '../api/client'
import { createQueryClient } from '../app/queryClient'
import { expectNoAxeViolations } from '../test/axe'
import { AuthPage } from './AuthPage'
import { AuthProvider } from './AuthProvider'

vi.mock('../api/authApi')

function renderPage(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AuthPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// The API's one answer to every failed login.
const failedLoginMessage = 'Invalid email or password. After repeated failed attempts, sign-in pauses for a few minutes.'

describe('AuthPage', () => {
  it('shows each API validation error beside its field', async () => {
    vi.mocked(authApi.register).mockRejectedValue(new ApiError(
      'Email must be 255 characters or fewer. Password must contain a number.',
      400,
      { email: 'Email must be 255 characters or fewer.', password: 'Password must contain a number.' },
    ))
    renderPage('/register')

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Ada')
    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'taken@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'Password')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    const email = screen.getByRole('textbox', { name: 'Email' })
    expect(email).toHaveAccessibleDescription('Email must be 255 characters or fewer.')
    expect(email).toHaveFocus()
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'At least 8 characters, including a number. Password must contain a number.',
    )
    expect(screen.getByRole('textbox', { name: 'Name' })).not.toHaveAttribute('aria-invalid')
  })

  it('after registering, says to check the inbox, whether or not the address was new', async () => {
    vi.mocked(authApi.register).mockResolvedValue({ message: 'Check your inbox to finish creating your account.' })
    renderPage('/register')

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Ada')
    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'Password1')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Check your inbox to finish creating your account.')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in')
  })

  it('links to a password reset and to a new confirmation email', () => {
    renderPage('/login')

    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: "Didn't get the confirmation email?" }))
      .toHaveAttribute('href', '/resend-verification')
  })

  it('checks the fields before sending them', async () => {
    renderPage('/login')

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription('Enter a valid email address.')
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.')
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it('shows a failed login for the whole form', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(failedLoginMessage, 401))
    renderPage('/login')

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'user@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(`Error: ${failedLoginMessage}`)
  })

  it('says when the account is deactivated, which the API only reveals after the right password', async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError('This account has been deactivated. Contact an administrator.', 403),
    )
    renderPage('/login')

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'user@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'right-password')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Error: This account has been deactivated. Contact an administrator.')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('has one h1 and no accessibility violations', async () => {
    const { container } = renderPage('/register')

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    await expectNoAxeViolations(container)
  })
})
