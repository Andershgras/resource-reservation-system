import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { startSession } from '../auth/authSession'
import { expectNoAxeViolations } from '../test/axe'
import { createQueryClient } from './queryClient'
import { WorkspaceLayout } from './WorkspaceLayout'

const tabs = [
  { path: '/admin/resources', label: 'Resources' },
  { path: '/admin/reservations', label: 'Reservations' },
]

function renderLayout(path: string) {
  startSession({
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    expiresInSeconds: 60,
    user: { id: 1, name: 'Admin', email: 'admin@example.com', role: 'Admin' },
  })

  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route
              element={(
                <WorkspaceLayout
                  title="Booking operations"
                  description="Manage what can be booked."
                  tabs={tabs}
                  searches={{}}
                  statsLabel="Admin summary"
                  stats={[{ label: 'Active resources', value: 2 }]}
                />
              )}
            >
              <Route path="/admin/resources" element={<p>Resources screen</p>} />
              <Route path="/admin/reservations" element={<p>Reservations screen</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceLayout', () => {
  it('starts with a skip link to the main content', async () => {
    renderLayout('/admin/resources')

    await userEvent.tab()

    const skipLink = screen.getByRole('link', { name: 'Skip to main content' })
    expect(skipLink).toHaveFocus()
    expect(skipLink).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
  })

  it('has one h1 and marks the current screen in the navigation', () => {
    renderLayout('/admin/reservations')

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const navigation = screen.getByRole('navigation', { name: 'Section navigation' })
    expect(within(navigation).getByRole('link', { name: 'Reservations' })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getByRole('link', { name: 'Resources' })).not.toHaveAttribute('aria-current')
  })

  it('names the document after the current screen', async () => {
    renderLayout('/admin/resources')
    expect(document.title).toBe('Resources · Resource Reservation')

    await userEvent.click(screen.getByRole('link', { name: 'Reservations' }))

    expect(document.title).toBe('Reservations · Resource Reservation')
  })

  it('shows the summary as a labelled description list', () => {
    renderLayout('/admin/resources')

    const summary = screen.getByLabelText('Admin summary')
    expect(within(summary).getByRole('term')).toHaveTextContent('Active resources')
    expect(within(summary).getByRole('definition')).toHaveTextContent('2')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderLayout('/admin/resources')

    await expectNoAxeViolations(container)
  })
})
