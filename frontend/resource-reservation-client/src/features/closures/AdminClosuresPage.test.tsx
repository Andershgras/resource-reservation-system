import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import * as closuresApi from '../../api/closuresApi'
import * as reservationsApi from '../../api/reservationsApi'
import * as resourcesApi from '../../api/resourcesApi'
import type { ClosureResponse, ReservationResponse } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { newReservationFields, noRuleOverrides } from '../../test/fixtures'
import { renderScreen } from '../../test/renderScreen'
import { AdminClosuresPage } from './AdminClosuresPage'

vi.mock('../../api/closuresApi')
vi.mock('../../api/reservationsApi')
vi.mock('../../api/resourcesApi')

const booking: ReservationResponse = {
  id: 7,
  resourceId: 1,
  resourceName: 'Room A',
  userId: 2,
  userName: 'Ada',
  userEmail: 'ada@example.com',
  startTime: '2030-01-16T10:00:00',
  endTime: '2030-01-16T11:00:00',
  status: 'Active',
  ...newReservationFields,
}

const closure: ClosureResponse = {
  id: 3,
  resourceId: 1,
  resourceName: 'Room A',
  startTime: '2030-01-16T09:00:00',
  endTime: '2030-01-16T12:00:00',
  reason: 'Repairs',
  createdAt: '2030-01-10T08:00:00+00:00',
  createdByName: 'Admin',
}

beforeEach(() => {
  vi.mocked(resourcesApi.getResources).mockResolvedValue([
    { id: 1, name: 'Room A', description: null, location: null, isActive: true, ...noRuleOverrides },
  ])
  vi.mocked(closuresApi.getClosures).mockResolvedValue([])
  vi.mocked(reservationsApi.getReservations).mockResolvedValue([booking])
})

function renderPage() {
  return renderScreen(<AdminClosuresPage />, { path: '/admin/closures' })
}

async function fillForm() {
  await screen.findByRole('option', { name: 'Room A' })
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Resource' }), 'Room A')
  await userEvent.type(screen.getByLabelText('Start'), '2030-01-16T09:00')
  await userEvent.type(screen.getByLabelText('End'), '2030-01-16T12:00')
  await userEvent.type(screen.getByRole('textbox', { name: 'Reason' }), 'Repairs')
}

const request = {
  resourceId: 1,
  startTime: '2030-01-16T09:00',
  endTime: '2030-01-16T12:00',
  reason: 'Repairs',
}

describe('AdminClosuresPage', () => {
  it('checks every field before asking the API', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Check affected bookings' }))

    expect(screen.getByRole('combobox', { name: 'Resource' })).toHaveAccessibleDescription('Select a resource.')
    expect(screen.getByRole('textbox', { name: 'Reason' }))
      .toHaveAccessibleDescription('Shown to everyone in the calendar. Enter a reason, such as a holiday or maintenance.')
    expect(closuresApi.previewClosure).not.toHaveBeenCalled()
  })

  it('shows the bookings inside before closing, and lists them afterwards without cancelling', async () => {
    vi.mocked(closuresApi.previewClosure).mockResolvedValue([booking])
    vi.mocked(closuresApi.createClosure).mockResolvedValue({ closure, affectedReservations: [booking] })
    renderPage()
    await fillForm()

    await userEvent.click(screen.getByRole('button', { name: 'Check affected bookings' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Close Room A?' })
    expect(dialog).toHaveAccessibleDescription(
      "1 active booking falls inside Wed 16 Jan 2030, 09:00–12:00. They won't be cancelled. You can cancel them afterwards.",
    )
    expect(within(dialog).getByRole('list', { name: 'Affected bookings' }))
      .toHaveTextContent('Wed 16 Jan 2030, 10:00–11:00: Ada (ada@example.com)')
    expect(closuresApi.createClosure).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close resource' }))

    expect(closuresApi.createClosure).toHaveBeenCalledWith(request)
    expect(await screen.findByText(
      /Room A is closed Wed 16 Jan 2030, 09:00–12:00\. 1 booking is inside the closure and still active\./,
    )).toBeInTheDocument()
    const affected = screen.getByRole('region', { name: 'Bookings inside the new closure' })
    expect(within(affected).getByText('Ada (ada@example.com)')).toBeInTheDocument()
    expect(within(affected).getByRole('button', { name: /^Cancel Room A/ })).toBeInTheDocument()
    expect(reservationsApi.cancelReservation).not.toHaveBeenCalled()
  })

  it('reports bookings made between the preview and the closure', async () => {
    vi.mocked(closuresApi.previewClosure).mockResolvedValue([])
    vi.mocked(closuresApi.createClosure).mockResolvedValue({ closure, affectedReservations: [booking] })
    renderPage()
    await fillForm()

    await userEvent.click(screen.getByRole('button', { name: 'Check affected bookings' }))
    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      'No active bookings fall inside Wed 16 Jan 2030, 09:00–12:00.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Close resource' }))

    expect(await screen.findByText(/1 booking is inside the closure and still active/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Bookings inside the new closure' })).toBeInTheDocument()
  })

  it('shows a refusal from the API on the form, without asking to confirm', async () => {
    vi.mocked(closuresApi.previewClosure).mockRejectedValue(new ApiError('Closures must end in the future.', 400))
    renderPage()
    await fillForm()

    await userEvent.click(screen.getByRole('button', { name: 'Check affected bookings' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Closures must end in the future.')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('deletes only the chosen closure', async () => {
    vi.mocked(closuresApi.getClosures).mockResolvedValue([closure, { ...closure, id: 4, reason: 'Cleaning' }])
    vi.mocked(closuresApi.deleteClosure).mockResolvedValue(undefined)
    renderPage()
    const repairs = (await screen.findByText('Repairs')).closest('li')!
    expect(within(repairs).getByText('Thu 10 Jan 2030, 09:00 by Admin')).toBeInTheDocument()

    await userEvent.click(within(repairs).getByRole('button', { name: /^Delete closure of Room A/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete closure' }))

    expect(closuresApi.deleteClosure).toHaveBeenCalledWith(3)
    expect(await screen.findByText('Closure deleted.')).toBeInTheDocument()
  })

  it('has no accessibility violations with the confirmation open', async () => {
    vi.mocked(closuresApi.previewClosure).mockResolvedValue([booking])
    renderPage()
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: 'Check affected bookings' }))
    await screen.findByRole('alertdialog')

    await expectNoAxeViolations(document.body)
  })
})
