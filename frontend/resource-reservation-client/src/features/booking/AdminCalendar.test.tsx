import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as reservationsApi from '../../api/reservationsApi'
import * as resourcesApi from '../../api/resourcesApi'
import type { ReservationResponse, ResourceScheduleResponse, UserResponse } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { newReservationFields, noRuleOverrides, testPolicy } from '../../test/fixtures'
import { renderScreen, testAdmin } from '../../test/renderScreen'
import { BookingPage } from './BookingPage'

vi.mock('../../api/resourcesApi')
vi.mock('../../api/reservationsApi')

const adasBooking: ReservationResponse = {
  id: 42,
  resourceId: 1,
  resourceName: 'Room A',
  userId: 2,
  userName: 'Ada',
  userEmail: 'ada@example.com',
  startTime: '2030-01-15T10:00:00',
  endTime: '2030-01-15T11:00:00',
  status: 'Active',
  ...newReservationFields,
}

// The week of Monday 14 January 2030. The public schedule knows only the
// times, never who booked.
function weekSchedule(withAdasBooking = true): ResourceScheduleResponse {
  return {
    resourceId: 1,
    resourceName: 'Room A',
    fromDate: '2030-01-14',
    toDate: '2030-01-20',
    policy: testPolicy,
    bookableSlots: withAdasBooking
      ? [
          { startTime: '2030-01-15T08:00:00', endTime: '2030-01-15T10:00:00' },
          { startTime: '2030-01-15T11:00:00', endTime: '2030-01-15T16:00:00' },
        ]
      : [{ startTime: '2030-01-15T08:00:00', endTime: '2030-01-15T16:00:00' }],
    reservedSlots: withAdasBooking ? [{ startTime: '2030-01-15T10:00:00', endTime: '2030-01-15T11:00:00' }] : [],
    closedSlots: [],
  }
}

beforeEach(() => {
  vi.mocked(resourcesApi.getResources).mockResolvedValue([
    { id: 1, name: 'Room A', description: null, location: null, isActive: true, ...noRuleOverrides },
  ])
  vi.mocked(resourcesApi.getResourceSchedule).mockImplementation(
    async (_id, _from, _to, excludeReservationId) => weekSchedule(excludeReservationId !== 42),
  )
  vi.mocked(reservationsApi.getResourceReservations).mockResolvedValue([adasBooking])
  vi.mocked(reservationsApi.getReservation).mockResolvedValue(adasBooking)
})

function renderAdminCalendar(url = '/admin/calendar?resource=1&week=2030-01-14') {
  return renderScreen(<BookingPage variant="admin" />, { path: '/admin/calendar', url, user: testAdmin })
}

function tuesday() {
  return screen.getByRole('region', { name: 'Tue 15 Jan' })
}

describe('Admin calendar', () => {
  it('shows who made each booking, from the admin reservations of that week', async () => {
    renderAdminCalendar()

    const booking = await screen.findByRole('button', {
      name: 'Reserved Tue 15 Jan 2030, 10:00–11:00 by Ada. Move this booking',
    })

    expect(booking).toHaveTextContent('Reserved 10:00–11:00 Ada')
    expect(reservationsApi.getResourceReservations).toHaveBeenCalledWith(1, '2030-01-14', '2030-01-20')
  })

  it("doesn't offer free time until a booking is being moved", async () => {
    renderAdminCalendar()
    await screen.findByRole('button', { name: /^Reserved .* by Ada/ })

    expect(within(tuesday()).queryByRole('button', { name: /^Available/ })).not.toBeInTheDocument()
    expect(within(tuesday()).getByText('08:00–10:00')).toBeInTheDocument()
  })

  it('moves a booking with its version and returns to the same week', async () => {
    vi.mocked(reservationsApi.rescheduleReservation).mockResolvedValue({
      ...adasBooking,
      startTime: '2030-01-15T13:00:00',
      endTime: '2030-01-15T14:00:00',
    })
    const { router } = renderAdminCalendar()

    await userEvent.click(await screen.findByRole('button', { name: /^Reserved .* by Ada/ }))

    expect(router.state.location.search).toBe('?resource=1&week=2030-01-14&move=42')
    expect(await screen.findByText('Ada (ada@example.com)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stop moving' })).toHaveAttribute('href', '/admin/calendar?resource=1&week=2030-01-14')
    // Ada's own time is free while it is being moved.
    await userEvent.click(await screen.findByRole('button', { name: 'Available Tue 15 Jan 2030, 08:00–16:00. Choose a time' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Start' }), '13:00')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'End' }), '14:00')
    await userEvent.click(screen.getByRole('button', { name: 'Move booking' }))

    expect(reservationsApi.rescheduleReservation).toHaveBeenCalledWith(42, {
      startTime: '2030-01-15T13:00:00',
      endTime: '2030-01-15T14:00:00',
      version: adasBooking.version,
    })
    await waitFor(() => expect(router.state.location.search).toBe('?resource=1&week=2030-01-14'))
    expect(await screen.findByRole('status')).toHaveTextContent('Booking moved to Tue 15 Jan 2030, 13:00–14:00.')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderAdminCalendar()
    await screen.findByRole('button', { name: /^Reserved .* by Ada/ })

    await expectNoAxeViolations(container)
  })
})

describe('User calendar', () => {
  const user: UserResponse = { id: 2, name: 'Ada', email: 'ada@example.com', role: 'User' }

  it('never asks for who made the bookings', async () => {
    renderScreen(<BookingPage />, { path: '/book', url: '/book?resource=1&week=2030-01-14', user })

    expect(await screen.findByText('Reserved', { selector: '.calendar-segment-kind' })).toBeInTheDocument()
    expect(screen.queryByText('Ada')).not.toBeInTheDocument()
    expect(reservationsApi.getResourceReservations).not.toHaveBeenCalled()
  })
})
