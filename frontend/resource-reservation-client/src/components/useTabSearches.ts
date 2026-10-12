import { useState } from 'react'
import { useLocation } from 'react-router'
import type { NavTab } from './NavTabs'

// The last search part of each tab's address, such as "?status=Active", so
// returning to a tab restores its filters or selection. Call it in a layout
// that stays mounted while switching tabs.
export function useTabSearches(tabs: NavTab[]) {
  const { pathname, search } = useLocation()
  const [searches, setSearches] = useState<Record<string, string>>({})
  const isTab = tabs.some((tab) => tab.path === pathname)

  if (isTab && (searches[pathname] ?? '') !== search) {
    setSearches({ ...searches, [pathname]: search })
  }

  return searches
}
