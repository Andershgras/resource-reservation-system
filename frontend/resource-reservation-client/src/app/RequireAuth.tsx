import type { ReactNode } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router'
import type { UserRole } from '../api/types'
import { useAuth } from '../auth/authContext'
import { homePathFor, loginPathFor, safeReturnTo } from '../lib/navigation'

interface RequireAuthProps {
  role: UserRole
  children: ReactNode
}

// Shows its children only to a logged-in user with the given role. Anyone else
// goes to the login screen, which returns here afterwards, or to their own home.
// After an explicit logout there is nothing to return to.
//
// These guards decide every redirect around login and logout. Navigating from
// event handlers as well would race them, because React Router applies
// navigation as a transition, after the change of user has already rendered.
export function RequireAuth({ role, children }: RequireAuthProps) {
  const { currentUser, sessionEnd } = useAuth()
  const location = useLocation()

  if (!currentUser) {
    const loginPath = sessionEnd === 'loggedOut'
      ? '/login'
      : loginPathFor(location.pathname + location.search)

    return <Navigate to={loginPath} replace />
  }

  if (currentUser.role !== role) {
    return <Navigate to={homePathFor(currentUser.role)} replace />
  }

  return children
}

// The login and registration screens are for logged-out visitors only. Once
// logged in, the user moves on to returnTo, or to their home.
export function RequireLoggedOut({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const [searchParams] = useSearchParams()

  if (!currentUser) {
    return children
  }

  return (
    <Navigate
      to={safeReturnTo(searchParams.get('returnTo')) ?? homePathFor(currentUser.role)}
      replace
    />
  )
}

export function HomeRedirect() {
  const { currentUser } = useAuth()

  return <Navigate to={currentUser ? homePathFor(currentUser.role) : '/login'} replace />
}
