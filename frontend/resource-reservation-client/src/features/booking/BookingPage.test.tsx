import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import * as reservationsApi from '../../api/reservationsApi'
import * as resourcesApi from '../../api/resourcesApi'
import type { ResourceScheduleResponse, UserResponse } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { renderScreen } from '../../test/renderScreen'
import { BookingPage } from './BookingPage'

vi.mock('../../api/resourcesApi')
vi.mock('../../api/reservationsApi')

const user: UserResponse = { id: 2, name: 'User', email: 'user@example.com', role: 'User' }

// The week of Monday 14 January 2030.
function weekSchedule(overrides: Partial<ResourceScheduleResponse> = {}): ResourceScheduleResponse {
  return {
    resourceId: 1,
    resourceName: 'Room A',
    fromDate: '2030-01-14',
    toDate: '2030-01-20',
    bookableSlots: [
      { startTime: '2030-01-15T08:00:00', endTime: '2030-01-15T10:07:00' },
      { startTime: '2030-01-15T11:23:00', endTime: '2030-01-15T16:00:00' },
    ],
    reservedSlots: [
      { startTime: '2030-01-15T10:07:00', endTime: '2030-01-15T11:23:00' },
      { startTime: '2030-01-16T08:00:00', endTime: '2030-01-16T16:00:00' },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(resourcesApi.getResources).mockResolvedValue([
    { id: 1, name: 'Room A', description: null, location: 'First floor', isActive: true },
  ])
  vi.mocked(resourcesApi.getResourceSchedule).mockResolvedValue(weekSchedule())
})

function renderBooking(url = '/book?resource=1&week=2030-01-14') {
  return renderScreen(<BookingPage />, { path: '/book', url, user })
}

function day(label: string) {
  return screen.getByRole('region', { name: label })
}

async function chooseTuesdayMorning() {
  await userEvent.click(await screen.findByRole('button', {
    name: 'Available Tue 15 Jan 2030, 08:00–10:07. Choose a time',
  }))
}

describe('BookingPage calendar', () => {
  it('loads Monday to Sunday of the week in the address', async () => {
    renderBooking()

    expect(await screen.findByText(/Mon 14 Jan 2030 – Sun 20 Jan 2030/)).toBeInTheDocument()
    await waitFor(() => expect(resourcesApi.getResourceSchedule).toHaveBeenCalledWith(1, '2030-01-14', '2030-01-20'))
  })

  it('shows free and reserved time in order, including arbitrary minutes', async () => {
    renderBooking()

    await chooseTuesdayMorning()
    const items = within(day('Tue 15 Jan')).getAllByRole('listitem').map((item) => item.textContent)

    expect(items).toEqual(['Available 08:00–10:07', 'Reserved 10:07–11:23', 'Available 11:23–16:00'])
  })

  // Audit L3: fully booked days used to disappear from the schedule.
  it('keeps every day, marking fully booked and closed days', async () => {
    renderBooking()
    await screen.findByRole('region', { name: 'Wed 16 Jan' })

    expect(within(day('Wed 16 Jan')).getByText('Fully booked')).toBeInTheDocument()
    expect(within(day('Wed 16 Jan')).getByText('Reserved')).toBeInTheDocument()
    expect(within(day('Thu 17 Jan')).getByText('Closed')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(7)
  })

  it('books a start and end chosen in 15-minute steps inside the free time', async () => {
    vi.mocked(reservationsApi.createReservation).mockResolvedValue({
      id: 9,
      resourceId: 1,
      resourceName: 'Room A',
      userId: 2,
      userName: 'User',
      userEmail: 'user@example.com',
      startTime: '2030-01-15T08:30:00',
      endTime: '2030-01-15T10:07:00',
      status: 'Active',
    })
    renderBooking()

    await chooseTuesdayMorning()
    const start = screen.getByRole('combobox', { name: 'Start' })
    const end = screen.getByRole('combobox', { name: 'End' })

    expect(start).toHaveFocus()
    expect(screen.getByRole('group', { name: 'Book Room A Free Tue 15 Jan 2030, 08:00–10:07' })).toBeInTheDocument()
    expect(within(start).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30', '09:45', '10:00'])
    expect(end).toHaveValue('2030-01-15T09:00:00')

    await userEvent.selectOptions(start, '08:30')
    await userEvent.selectOptions(end, '10:07')
    expect(screen.getByText('1 h 37 min')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reserve' }))

    expect(reservationsApi.createReservation).toHaveBeenCalledWith({
      resourceId: 1,
      startTime: '2030-01-15T08:30:00',
      endTime: '2030-01-15T10:07:00',
    })
    const notice = await screen.findByRole('status', { name: '' })
    expect(notice).toHaveTextContent('Reservation created: Tue 15 Jan 2030, 08:30–10:07.')
    expect(notice.parentElement).toHaveFocus()
    expect(screen.queryByRole('combobox', { name: 'Start' })).not.toBeInTheDocument()
  })

  it('keeps the end after the start when the start moves past it', async () => {
    renderBooking()
    await chooseTuesdayMorning()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Start' }), '09:45')

    expect(screen.getByRole('combobox', { name: 'End' })).toHaveValue('2030-01-15T10:07:00')
    expect(within(screen.getByRole('combobox', { name: 'End' })).getAllByRole('option')
      .map((option) => option.textContent)).toEqual(['10:00', '10:07'])
  })

  it('reloads the calendar when someone else booked the time first', async () => {
    vi.mocked(reservationsApi.createReservation).mockRejectedValue(
      new ApiError('Resource is already reserved in this time period.', 409),
    )
    renderBooking()
    await chooseTuesdayMorning()
    vi.mocked(resourcesApi.getResourceSchedule).mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Reserve' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Resource is already reserved in this time period. The calendar has been updated.',
    )
    expect(resourcesApi.getResourceSchedule).toHaveBeenCalled()
  })

  it('shows a schedule that failed to load, with a way to try again', async () => {
    vi.mocked(resourcesApi.getResourceSchedule).mockRejectedValueOnce(new ApiError('Resource is not active.', 400))
    renderBooking()

    expect(await screen.findByRole('alert')).toHaveTextContent('Resource is not active.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('region', { name: 'Tue 15 Jan' })).toBeInTheDocument()
  })

  it('says so when the week has no free time', async () => {
    vi.mocked(resourcesApi.getResourceSchedule).mockResolvedValue(weekSchedule({ bookableSlots: [] }))
    renderBooking()

    expect(await screen.findByText('No bookable times found this week.')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(7)
  })

  it('asks for a resource first', async () => {
    renderBooking('/book')

    expect(await screen.findByText('Choose a resource to see bookable times.')).toBeInTheDocument()
    expect(resourcesApi.getResourceSchedule).not.toHaveBeenCalled()
  })

  it('moves between weeks in the address', async () => {
    const { router } = renderBooking()
    await screen.findByRole('region', { name: 'Tue 15 Jan' })

    await userEvent.click(screen.getByRole('button', { name: 'Next week' }))

    expect(router.state.location.search).toBe('?resource=1&week=2030-01-21')
    expect(resourcesApi.getResourceSchedule).toHaveBeenLastCalledWith(1, '2030-01-21', '2030-01-27')
  })

  // Choosing a resource and then a date before React re-renders must keep
  // both, rather than building the second change on the stale selection.
  it('keeps the resource when a date is chosen straight after it', async () => {
    const { router } = renderBooking('/book?week=2030-01-14')
    const viewAvailability = await screen.findByRole('button', { name: 'View availability for Room A' })

    await act(async () => {
      viewAvailability.click()
      fireEvent.change(screen.getByLabelText('Go to date'), { target: { value: '2030-01-23' } })
    })

    expect(router.state.location.search).toBe('?resource=1&week=2030-01-21')
  })

  it('asks before leaving with a changed time', async () => {
    renderBooking()
    await chooseTuesdayMorning()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Start' }), '08:30')
    await userEvent.click(screen.getByRole('link', { name: 'Go elsewhere' }))

    expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
  })

  it('opens the booking form inside the chosen day on small screens', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 760px)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    renderBooking()

    await chooseTuesdayMorning()

    expect(within(day('Tue 15 Jan')).getByRole('combobox', { name: 'Start' })).toHaveFocus()
  })

  it('opens the booking form below the week on wide screens', async () => {
    renderBooking()

    await chooseTuesdayMorning()

    expect(within(day('Tue 15 Jan')).queryByRole('combobox', { name: 'Start' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Start' })).toHaveFocus()
  })

  it('has no accessibility violations with a time being chosen', async () => {
    const { container } = renderBooking()
    await chooseTuesdayMorning()

    await expectNoAxeViolations(container)
  })
})
