import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import type { UserAccountResponse } from '../../api/types'
import { userPageSize } from '../../api/usersApi'
import { useCurrentUser } from '../../auth/authContext'
import { useConfirm } from '../../components/confirmContext'
import { formatInstant } from '../../lib/dates'
import { getErrorMessage } from '../../lib/errors'
import { Alert, type Notice } from '../../ui/Alert'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Field, Input } from '../../ui/Field'
import { EmptyState, LoadingState } from '../../ui/States'
import { useChangeUserRole, useChangeUserStatus, useUsers } from './userQueries'
import '../../components/forms.css'
import '../../components/lists.css'
import './AdminUsersPage.css'

// /admin/users: every account, with role and status changes. The search and
// page are kept in the address, such as ?search=ada&page=2. Admins can't
// change their own account here, and the API never leaves the system without
// an active admin.
export function AdminUsersPage() {
  const currentUser = useCurrentUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = (searchParams.get('search') ?? '').trim()
  const page = parsePage(searchParams.get('page'))
  const usersQuery = useUsers(search, page)
  const changeRole = useChangeUserRole()
  const changeStatus = useChangeUserStatus()
  const confirm = useConfirm()
  const [searchText, setSearchText] = useState(search)
  const [notice, setNotice] = useState<Notice | null>(null)

  const users = usersQuery.data?.items ?? []
  const totalCount = usersQuery.data?.totalCount ?? 0
  const pageCount = Math.max(1, Math.ceil(totalCount / userPageSize))

  function showPage(nextSearch: string, nextPage: number) {
    const next = new URLSearchParams()

    if (nextSearch) {
      next.set('search', nextSearch)
    }

    if (nextPage > 1) {
      next.set('page', String(nextPage))
    }

    setSearchParams(next, { replace: true })
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    showPage(searchText.trim(), 1)
  }

  function handleRoleChange(user: UserAccountResponse) {
    const role = user.role === 'Admin' ? 'User' : 'Admin'

    confirm({
      title: role === 'Admin' ? `Make ${user.name} an admin?` : `Remove ${user.name}'s admin role?`,
      message: role === 'Admin'
        ? `${user.name} will be able to manage resources, reservations and users. ` +
          'They are signed out and get the new role when they sign in again.'
        : `${user.name} will become a regular user. They are signed out and sign in again as a user.`,
      confirmLabel: role === 'Admin' ? 'Make admin' : 'Remove admin role',
      tone: 'primary',
      onConfirm: async () => {
        setNotice(null)

        try {
          await changeRole.mutateAsync({ user, role })
          setNotice({ tone: 'success', text: `${user.name} is now ${role === 'Admin' ? 'an admin' : 'a user'}.` })
        } catch (error) {
          setNotice({ tone: 'danger', text: getErrorMessage(error) })
        }
      },
    })
  }

  function handleStatusChange(user: UserAccountResponse) {
    const isActive = !user.isActive

    confirm({
      title: isActive ? `Reactivate ${user.name}?` : `Deactivate ${user.name}?`,
      message: isActive
        ? `${user.name} will be able to sign in again.`
        : `${user.name} is signed out and can't sign in until reactivated. Their reservations are kept.`,
      confirmLabel: isActive ? 'Reactivate' : 'Deactivate',
      tone: isActive ? 'primary' : 'danger',
      onConfirm: async () => {
        setNotice(null)

        try {
          await changeStatus.mutateAsync({ user, isActive })
          setNotice({ tone: 'success', text: `${user.name} is ${isActive ? 'reactivated' : 'deactivated'}.` })
        } catch (error) {
          setNotice({ tone: 'danger', text: getErrorMessage(error) })
        }
      },
    })
  }

  function isChanging(user: UserAccountResponse) {
    return (changeRole.isPending && changeRole.variables.user.id === user.id) ||
      (changeStatus.isPending && changeStatus.variables.user.id === user.id)
  }

  return (
    <Card
      title="Users"
      description="Change who is an admin, and deactivate accounts that should no longer sign in."
      actions={<Badge label={`${totalCount} users`}>{totalCount}</Badge>}
    >
      <form className="list-filters user-search" role="search" onSubmit={handleSearch}>
        <Field label="Name or email">
          {(props) => (
            <Input
              {...props}
              type="search"
              maxLength={100}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit">Search</Button>
      </form>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {!notice && usersQuery.error && <Alert tone="danger">{getErrorMessage(usersQuery.error)}</Alert>}
      {usersQuery.isPending && <LoadingState>Loading users...</LoadingState>}
      {!usersQuery.isPending && users.length === 0 && (
        <EmptyState
          title={search ? `No users match "${search}".` : 'No users.'}
          action={search && <Button size="sm" onClick={() => { setSearchText(''); showPage('', 1) }}>Show all users</Button>}
        />
      )}

      {users.length > 0 && (
        <ul className="item-list">
          {users.map((user) => {
            const isSelf = user.id === currentUser.id

            return (
              <li key={user.id} className={user.isActive ? 'item' : 'item item-muted'}>
                <div className="item-main">
                  <p className="item-title">
                    <strong>{user.name}</strong>
                    {isSelf && <Badge tone="primary">You</Badge>}
                    {user.role === 'Admin' && <Badge tone="primary">Admin</Badge>}
                    {!user.isActive && <Badge tone="warning">Deactivated</Badge>}
                  </p>
                  <dl className="item-meta">
                    <div>
                      <dt className="visually-hidden">Email</dt>
                      <dd>{user.email}</dd>
                    </div>
                    <div>
                      <dt>Joined</dt>
                      <dd>{user.createdAt ? formatInstant(user.createdAt) : 'Not recorded'}</dd>
                    </div>
                  </dl>
                </div>
                <div className="item-actions">
                  {isSelf ? (
                    <p className="user-self-note">You can't change your own account.</p>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        aria-label={user.role === 'Admin' ? `Remove admin role from ${user.name}` : `Make ${user.name} an admin`}
                        disabled={isChanging(user)}
                        onClick={() => handleRoleChange(user)}
                      >
                        {user.role === 'Admin' ? 'Remove admin' : 'Make admin'}
                      </Button>
                      <Button
                        size="sm"
                        variant={user.isActive ? 'ghost' : 'secondary'}
                        aria-label={user.isActive ? `Deactivate ${user.name}` : `Reactivate ${user.name}`}
                        disabled={isChanging(user)}
                        onClick={() => handleStatusChange(user)}
                      >
                        {user.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {pageCount > 1 && (
        <nav className="pagination" aria-label="User pages">
          <Button size="sm" disabled={page <= 1} onClick={() => showPage(search, page - 1)}>
            Previous
          </Button>
          <span aria-live="polite">Page {Math.min(page, pageCount)} of {pageCount}</span>
          <Button size="sm" disabled={page >= pageCount} onClick={() => showPage(search, page + 1)}>
            Next
          </Button>
        </nav>
      )}
    </Card>
  )
}

// A page number from the address. Anything else shows the first page.
function parsePage(value: string | null) {
  const page = Number(value)

  return Number.isInteger(page) && page >= 1 ? page : 1
}
