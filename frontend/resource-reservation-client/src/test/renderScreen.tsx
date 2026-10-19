import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router'
import type { UserResponse } from '../api/types'
import { createQueryClient } from '../app/queryClient'
import { RequireAuth } from '../app/RequireAuth'
import { AuthProvider } from '../auth/AuthProvider'
import { startSession } from '../auth/authSession'
import { ConfirmProvider } from '../components/ConfirmProvider'

export const testAdmin: UserResponse = { id: 1, name: 'Admin', email: 'admin@example.com', role: 'Admin' }

// Renders one screen the way the app does: a signed-in user, a data router,
// starting at `url` (the route's `path` by default),
// the role guard and the confirmation provider, with a link to another screen
// and a login screen to be sent to. Without the role guard, the screen stays
// mounted when the session ends.
interface RenderScreenOptions {
  path?: string
  url?: string
  user?: UserResponse
  withRoleGuard?: boolean
}

export function renderScreen(screen: ReactNode, options: RenderScreenOptions = {}) {
  const { path = '/screen', user = testAdmin, withRoleGuard = true } = options
  const url = options.url ?? path
  const content = (
    <ConfirmProvider>
      <nav aria-label="Test navigation">
        <Link to="/elsewhere">Go elsewhere</Link>
        <Link to={`${path}?filter=1`}>Same screen</Link>
      </nav>
      <Outlet />
    </ConfirmProvider>
  )

  startSession({
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    expiresInSeconds: 3600,
    user,
  })

  const router = createMemoryRouter(
    [
      {
        element: withRoleGuard ? <RequireAuth role={user.role}>{content}</RequireAuth> : content,
        children: [
          { path, element: screen },
          { path: '/elsewhere', element: <h1>Elsewhere</h1> },
        ],
      },
      { path: '/login', element: <h1>Login screen</h1> },
    ],
    { initialEntries: [url] },
  )

  const result = render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )

  return { ...result, router }
}
