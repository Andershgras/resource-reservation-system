import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as reservationsApi from '../../api/reservationsApi'
import * as resourcesApi from '../../api/resourcesApi'
import type { ReservationResponse } from '../../api/types'
import { createQueryClient } from '../../app/queryClient'
import { ConfirmProvider } from '../../components/ConfirmProvider'
import { AdminReservationsPage } from './AdminReservationsPage'

vi.mock('../../api/reservationsApi')
vi.mock('../../api/resourcesApi')

function reservation(id: number, resourceId: number, resourceName: string, status: ReservationResponse['status']) {
  return {
    id,
    resourceId,
    resourceName,
    userId: 2,
    userName: 'Test User',
    userEmail: 'user@example.com',
    startTime: '2030-01-15T09:00:00',
    endTime: '2030-01-15T10:00:00',
    status,
  }
}

beforeEach(() => {
  vi.mocked(resourcesApi.getResources).mockResolvedValue([
    { id: 1, name: 'Room A', description: null, location: null, isActive: true },
    { id: 2, name: 'Room B', description: null, location: null, isActive: true },
  ])
  vi.mocked(reservationsApi.getReservations).mockResolvedValue([
    reservation(1, 1, 'Room A', 'Active'),
    reservation(2, 2, 'Room B', 'Active'),
    reservation(3, 2, 'Room B', 'Cancelled'),
  ])
})

function CurrentLocation() {
  const location = useLocation()

  return <output aria-label="Current location">{location.pathname + location.search}</output>
}

function renderPage(path: string) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <ConfirmProvider>
          <AdminReservationsPage />
        </ConfirmProvider>
        <CurrentLocation />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function shownReservations() {
  const list = await screen.findByRole('list')

  return within(list).getAllByRole('listitem').map((item) => within(item).getByRole('strong').textContent
    + ' ' + item.querySelector('.reservation-status')?.textContent)
}

describe('AdminReservationsPage', () => {
  it('shows every reservation without filters', async () => {
    renderPage('/admin/reservations')

    expect(await shownReservations()).toEqual(['Room A Active', 'Room B Active', 'Room B Cancelled'])
  })

  // Audit L1: admins saw only a user ID.
  it('shows who made each reservation', async () => {
    renderPage('/admin/reservations')

    const [firstReservation] = within(await screen.findByRole('list')).getAllByRole('listitem')

    expect(firstReservation).toHaveTextContent('Test User (user@example.com)')
    expect(firstReservation).not.toHaveTextContent('User ID')
  })

  it('applies the filters in the address', async () => {
    renderPage('/admin/reservations?resource=2&status=Cancelled')

    expect(await shownReservations()).toEqual(['Room B Cancelled'])
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('Cancelled')
  })

  it.each([
    ['resource=abc&status=Pending'],
    ['resource=-1'],
    ['resource=0&status=active'],
  ])('ignores invalid filters: %s', async (query) => {
    renderPage(`/admin/reservations?${query}`)

    expect(await shownReservations()).toHaveLength(3)
  })

  it('keeps chosen filters in the address', async () => {
    renderPage('/admin/reservations')
    await shownReservations()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Active')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Resource' }), 'Room B')

    expect(screen.getByRole('status', { name: 'Current location' })).toHaveTextContent(
      '/admin/reservations?status=Active&resource=2',
    )
    expect(await shownReservations()).toEqual(['Room B Active'])

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(screen.getByRole('status', { name: 'Current location' })).toHaveTextContent(/^\/admin\/reservations$/)
  })
})
