import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { UserAccountPage, UserAccountResponse } from '../../api/types'
import * as usersApi from '../../api/usersApi'
import { expectNoAxeViolations } from '../../test/axe'
import { renderScreen, testAdmin } from '../../test/renderScreen'
import { AdminUsersPage } from './AdminUsersPage'

vi.mock('../../api/usersApi', async (importOriginal) => ({
  ...await importOriginal<typeof usersApi>(),
  getUsers: vi.fn(),
  changeUserRole: vi.fn(),
  changeUserStatus: vi.fn(),
}))

const self: UserAccountResponse = {
  ...testAdmin,
  role: 'Admin',
  isActive: true,
  isEmailConfirmed: true,
  createdAt: null,
}

const ada: UserAccountResponse = {
  id: 2,
  name: 'Ada',
  email: 'ada@example.com',
  role: 'User',
  isActive: true,
  isEmailConfirmed: true,
  createdAt: '2030-01-10T08:00:00+00:00',
}

const bo: UserAccountResponse = {
  id: 3,
  name: 'Bo',
  email: 'bo@example.com',
  role: 'Admin',
  isActive: false,
  isEmailConfirmed: true,
  createdAt: '2030-01-11T08:00:00+00:00',
}

function pageOf(items: UserAccountResponse[], totalCount = items.length, page = 1): UserAccountPage {
  return { items, totalCount, page, pageSize: usersApi.userPageSize }
}

beforeEach(() => {
  vi.mocked(usersApi.getUsers).mockResolvedValue(pageOf([self, ada, bo]))
})

function renderPage(url = '/admin/users') {
  return renderScreen(<AdminUsersPage />, { path: '/admin/users', url })
}

async function findRow(name: string) {
  return (await screen.findByText(name, { selector: 'strong' })).closest('li')!
}

describe('AdminUsersPage', () => {
  it('lists accounts with their role and status, and offers no changes to your own', async () => {
    renderPage()

    const ownRow = await findRow('Admin')
    expect(within(ownRow).getByText('You')).toBeInTheDocument()
    expect(within(ownRow).queryByRole('button')).not.toBeInTheDocument()
    expect(within(ownRow).getByText("You can't change your own account.")).toBeInTheDocument()
    expect(within(ownRow).getByText('Not recorded')).toBeInTheDocument()

    const adaRow = await findRow('Ada')
    expect(within(adaRow).getByText('Thu 10 Jan 2030, 09:00')).toBeInTheDocument()
    expect(within(adaRow).getByRole('button', { name: 'Make Ada an admin' })).toBeInTheDocument()
    expect(within(adaRow).getByRole('button', { name: 'Deactivate Ada' })).toBeInTheDocument()

    const boRow = await findRow('Bo')
    expect(within(boRow).getByText('Deactivated')).toBeInTheDocument()
    expect(within(boRow).getByRole('button', { name: 'Remove admin role from Bo' })).toBeInTheDocument()
    expect(within(boRow).getByRole('button', { name: 'Reactivate Bo' })).toBeInTheDocument()
  })

  it('marks unconfirmed accounts, and offers no admin role for them', async () => {
    vi.mocked(usersApi.getUsers).mockResolvedValue(pageOf([self, { ...ada, isEmailConfirmed: false }]))
    renderPage()

    const adaRow = await findRow('Ada')
    expect(within(adaRow).getByText('Email not confirmed')).toBeInTheDocument()
    expect(within(adaRow).queryByRole('button', { name: 'Make Ada an admin' })).not.toBeInTheDocument()
    expect(within(adaRow).getByRole('button', { name: 'Deactivate Ada' })).toBeInTheDocument()
  })

  it('makes a user an admin after confirming, explaining they sign in again', async () => {
    vi.mocked(usersApi.changeUserRole).mockResolvedValue({ ...ada, role: 'Admin' })
    renderPage()

    await userEvent.click(within(await findRow('Ada')).getByRole('button', { name: 'Make Ada an admin' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Make Ada an admin?' })
    expect(dialog).toHaveAccessibleDescription(
      'Ada will be able to manage resources, reservations and users. ' +
        'They are signed out and get the new role when they sign in again.',
    )
    expect(usersApi.changeUserRole).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Make admin' }))

    expect(usersApi.changeUserRole).toHaveBeenCalledWith(2, 'Admin')
    expect(await screen.findByText('Ada is now an admin.')).toBeInTheDocument()
    // The list reloads with the change.
    expect(vi.mocked(usersApi.getUsers).mock.calls.length).toBeGreaterThan(1)
  })

  it('deactivates a user, saying their reservations are kept', async () => {
    vi.mocked(usersApi.changeUserStatus).mockResolvedValue({ ...ada, isActive: false })
    renderPage()

    await userEvent.click(within(await findRow('Ada')).getByRole('button', { name: 'Deactivate Ada' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Deactivate Ada?' })
    expect(dialog).toHaveAccessibleDescription(
      "Ada is signed out and can't sign in until reactivated. Their reservations are kept.",
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    expect(usersApi.changeUserStatus).toHaveBeenCalledWith(2, false)
    expect(await screen.findByText('Ada is deactivated.')).toBeInTheDocument()
  })

  it('reactivates a deactivated user', async () => {
    vi.mocked(usersApi.changeUserStatus).mockResolvedValue({ ...bo, isActive: true })
    renderPage()

    await userEvent.click(within(await findRow('Bo')).getByRole('button', { name: 'Reactivate Bo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate' }))

    expect(usersApi.changeUserStatus).toHaveBeenCalledWith(3, true)
    expect(await screen.findByText('Bo is reactivated.')).toBeInTheDocument()
  })

  it('shows why the API refused a change', async () => {
    vi.mocked(usersApi.changeUserRole).mockRejectedValue(
      new ApiError('There must always be at least one active admin.', 409),
    )
    renderPage()

    await userEvent.click(within(await findRow('Bo')).getByRole('button', { name: 'Remove admin role from Bo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove admin role' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('There must always be at least one active admin.')
  })

  it('searches by name or email, keeping the search in the address', async () => {
    const { router } = renderPage()
    await findRow('Ada')
    vi.mocked(usersApi.getUsers).mockResolvedValue(pageOf([ada]))

    await userEvent.type(screen.getByRole('searchbox', { name: 'Name or email' }), ' ada ')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(usersApi.getUsers).toHaveBeenLastCalledWith('ada', 1)
    expect(router.state.location.search).toBe('?search=ada')
    await waitFor(() => expect(screen.queryByText('Bo', { selector: 'strong' })).not.toBeInTheDocument())
  })

  it('says when nothing matches, and can show everyone again', async () => {
    vi.mocked(usersApi.getUsers).mockResolvedValue(pageOf([]))
    const { router } = renderPage('/admin/users?search=zed')

    expect(await screen.findByText('No users match "zed".')).toBeInTheDocument()
    vi.mocked(usersApi.getUsers).mockResolvedValue(pageOf([self, ada, bo]))
    await userEvent.click(screen.getByRole('button', { name: 'Show all users' }))

    expect(router.state.location.search).toBe('')
    expect(await findRow('Ada')).toBeInTheDocument()
  })

  it('pages through long lists, and ignores a page number that makes no sense', async () => {
    vi.mocked(usersApi.getUsers).mockResolvedValue(pageOf([ada], 30))
    const { router } = renderPage('/admin/users?page=nonsense')

    const pages = await screen.findByRole('navigation', { name: 'User pages' })
    expect(usersApi.getUsers).toHaveBeenCalledWith('', 1)
    expect(pages).toHaveTextContent('Page 1 of 2')
    expect(within(pages).getByRole('button', { name: 'Previous' })).toBeDisabled()

    await userEvent.click(within(pages).getByRole('button', { name: 'Next' }))

    expect(usersApi.getUsers).toHaveBeenLastCalledWith('', 2)
    expect(router.state.location.search).toBe('?page=2')
  })

  it('has no accessibility violations, with the confirmation open too', async () => {
    renderPage()
    await findRow('Ada')

    await expectNoAxeViolations(document.body)

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Ada' }))
    await screen.findByRole('alertdialog')

    await expectNoAxeViolations(document.body)
  })
})
