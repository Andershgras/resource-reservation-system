import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { UserResponse } from '../api/types'
import { AuthContext, type AuthContextValue, type SessionEnd } from '../auth/authContext'
import { App } from './App'

// The workspaces load data from the API, which these routing tests don't need.
vi.mock('./UserLayout', () => ({
  UserLayout: () => <p>Workspace</p>,
}))
vi.mock('./AdminLayout', () => ({
  AdminLayout: () => <p>Workspace</p>,
}))

const admin: UserResponse = { id: 1, name: 'Admin', email: 'admin@example.com', role: 'Admin' }
const user: UserResponse = { id: 2, name: 'User', email: 'user@example.com', role: 'User' }

function CurrentLocation() {
  const location = useLocation()

  return <output aria-label="Current location">{location.pathname + location.search}</output>
}

interface TestAuth {
  currentUser?: UserResponse | null
  sessionEnd?: SessionEnd
  // The user that logging in returns.
  loginUser?: UserResponse
}

// Stands in for AuthProvider: logging in sets the user, as the real one does.
function TestAuthProvider({ auth, logIn, children }: {
  auth: TestAuth
  logIn: AuthContextValue['logIn']
  children: ReactNode
}) {
  const [currentUser, setCurrentUser] = useState(auth.currentUser ?? null)
  const value: AuthContextValue = {
    currentUser,
    sessionEnd: auth.sessionEnd ?? null,
    logIn: async (credentials) => {
      const loggedIn = await logIn(credentials)
      setCurrentUser(loggedIn)
      return loggedIn
    },
    logOut: vi.fn(),
    clearSessionEnd: vi.fn(),
  }

  return <AuthContext value={value}>{children}</AuthContext>
}

function renderApp(path: string, auth: TestAuth = {}) {
  const logIn = vi.fn(async () => auth.loginUser ?? user)

  render(
    <TestAuthProvider auth={auth} logIn={logIn}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <CurrentLocation />
      </MemoryRouter>
    </TestAuthProvider>,
  )

  return { logIn }
}

function currentLocation() {
  return screen.getByRole('status', { name: 'Current location' }).textContent
}

describe('routes', () => {
  it('sends a logged-out visitor to the login screen, keeping where they were going', () => {
    renderApp('/admin/reservations')

    expect(currentLocation()).toBe('/login?returnTo=%2Fadmin%2Freservations')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('keeps the booking selection in returnTo', () => {
    renderApp('/book?resource=3&from=2030-01-14&to=2030-01-20')

    expect(currentLocation()).toBe(
      '/login?returnTo=%2Fbook%3Fresource%3D3%26from%3D2030-01-14%26to%3D2030-01-20',
    )
  })

  it.each([
    ['/', admin, '/admin/resources'],
    ['/', user, '/book'],
    ['/login', admin, '/admin/resources'],
    ['/register', user, '/book'],
    ['/admin/resources', user, '/book'],
    ['/my-reservations', admin, '/admin/resources'],
  ])('sends %s for a %s to their own screen', (path, currentUser, expected) => {
    renderApp(path, { currentUser })

    expect(currentLocation()).toBe(expected)
  })

  it('sends a user who logged out to the login screen without returnTo', () => {
    renderApp('/admin/reservations', { sessionEnd: 'loggedOut' })

    expect(currentLocation()).toBe('/login')
    expect(screen.getByText('You have been logged out.')).toBeInTheDocument()
  })

  it('shows the workspace for the right role', () => {
    renderApp('/admin/weekly-schedule', { currentUser: admin })

    expect(screen.getByText('Workspace')).toBeInTheDocument()
    expect(currentLocation()).toBe('/admin/weekly-schedule')
  })

  it('shows a not-found page for an unknown address', () => {
    renderApp('/no-such-page', { currentUser: user })

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('login screen', () => {
  it('returns to the page from returnTo after logging in', async () => {
    const { logIn } = renderApp('/login?returnTo=%2Fadmin%2Freservations', { loginUser: admin })

    await logInWith('admin@example.com', 'Admin1234')

    expect(logIn).toHaveBeenCalledWith({ email: 'admin@example.com', password: 'Admin1234' })
    expect(await screen.findByText('Workspace')).toBeInTheDocument()
    expect(currentLocation()).toBe('/admin/reservations')
  })

  it('ignores a returnTo that leads to another site', async () => {
    renderApp('/login?returnTo=https%3A%2F%2Fevil.example', { loginUser: user })

    await logInWith('user@example.com', 'Password1')

    expect(await screen.findByText('Workspace')).toBeInTheDocument()
    expect(currentLocation()).toBe('/book')
  })

  it('keeps returnTo when switching to registration', async () => {
    renderApp('/login?returnTo=%2Fmy-reservations')

    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('aria-current', 'page')

    await userEvent.click(screen.getByRole('link', { name: 'Register' }))

    expect(currentLocation()).toBe('/register?returnTo=%2Fmy-reservations')
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows why the session ended', () => {
    renderApp('/login', { sessionEnd: 'expired' })

    expect(screen.getByText('Your session has expired. Please log in again.')).toBeInTheDocument()
  })
})

async function logInWith(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), `${password}{Enter}`)
}
