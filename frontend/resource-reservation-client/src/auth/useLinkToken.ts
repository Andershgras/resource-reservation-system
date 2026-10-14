import { useLayoutEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

// The single-use token from an email link such as /reset-password#token=abc.
// It is read once, then removed from the address before the page is drawn, so
// it isn't left in the address bar, the history or a bookmark. The fragment is
// never sent to a server, so it doesn't reach any log either.
export function useLinkToken(): string | null {
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token'))

  useLayoutEffect(() => {
    if (location.hash) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true })
    }
  }, [location.hash, location.pathname, location.search, navigate])

  return token
}
