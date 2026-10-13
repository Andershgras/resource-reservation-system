import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import * as reservationsApi from '../../api/reservationsApi'
import type { ReservationResponse, UserResponse } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { newReservationFields } from '../../test/fixtures'
import { renderScreen } from '../../test/renderScreen'
import { MyReservationsPage } from './MyReservationsPage'

vi.mock('../../api/reservationsApi')

const user: UserResponse = { id: 2, name: 'User', email: 'user@example.com', role: 'User' }

function reservation(id: number, fields: Partial<ReservationResponse> = {}): ReservationResponse {
  return {
    id,
    resourceId: 3,
    resourceName: `Room ${id}`,
    userId: 2,
    userName: 'User',
    userEmail: 'user@example.com',
    startTime: '2030-01-17T09:00:00',
    endTime: '2030-01-17T10:00:00',
    status: 'Active',
    ...newReservationFields,
    ...fields,
  }
}

const upcoming = reservation(1, { updatedAt: '2030-01-11T12:30:00+00:00' })
const finished = reservation(2, { startTime: '2020-01-15T09:00:00', endTime: '2020-01-15T10:00:00' })
const cancelledByAdmin = reservation(3, {
  status: 'Cancelled',
  cancelledAt: '2030-01-12T08:00:00+00:00',
  cancelledByUserId: 1,
  cancelledByName: 'Admin',
})
const fromBeforeHistory = reservation(4, { createdAt: null })

beforeEach(() => {
  vi.mocked(reservationsApi.getMyReservations).mockResolvedValue([
    upcoming,
    finished,
    cancelledByAdmin,
    fromBeforeHistory,
  ])
})

function renderPage() {
  return renderScreen(<MyReservationsPage />, { path: '/my-reservations', user })
}

function item(resourceName: string) {
  return screen.getByText(resourceName).closest('li')!
}

describe('MyReservationsPage', () => {
  it('shows when each booking was made, moved and cancelled, in Copenhagen time', async () => {
    renderPage()
    await screen.findByText('Room 1')

    expect(within(item('Room 1')).getByText('Thu 10 Jan 2030, 09:00')).toBeInTheDocument()
    expect(within(item('Room 1')).getByText('Fri 11 Jan 2030, 13:30')).toBeInTheDocument()
    expect(within(item('Room 3')).getByText('Sat 12 Jan 2030, 09:00 by Admin')).toBeInTheDocument()
    expect(within(item('Room 4')).queryByText('Booked')).not.toBeInTheDocument()
  })

  it('offers to move only active bookings that have not started', async () => {
    renderPage()
    await screen.findByText('Room 1')

    expect(within(item('Room 1')).getByRole('link', { name: /^Move Room 1/ }))
      .toHaveAttribute('href', '/book?resource=3&week=2030-01-14&move=1')
    expect(within(item('Room 2')).queryByRole('link', { name: /^Move/ })).not.toBeInTheDocument()
    expect(within(item('Room 3')).queryByRole('link', { name: /^Move/ })).not.toBeInTheDocument()
  })

  it('cancels with the version that was shown, and explains a conflict', async () => {
    vi.mocked(reservationsApi.cancelReservation).mockRejectedValue(
      new ApiError('This reservation was changed by someone else. Reload it and try again.', 409),
    )
    renderPage()
    await screen.findByText('Room 1')

    await userEvent.click(within(item('Room 1')).getByRole('button', { name: /^Cancel Room 1/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel reservation' }))

    expect(reservationsApi.cancelReservation).toHaveBeenCalledWith(1, upcoming.version)
    expect(await screen.findByText('This reservation was changed by someone else. Reload it and try again.'))
      .toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderPage()
    await screen.findByText('Room 1')

    await expectNoAxeViolations(container)
  })
})
