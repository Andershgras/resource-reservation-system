import { NavLink } from 'react-router'

export interface NavTab {
  path: string
  label: string
}

interface NavTabsProps {
  tabs: NavTab[]
  searches: Record<string, string>
}

// Links between the screens of a workspace. NavLink marks the current screen
// with the "active" class and aria-current="page".
export function NavTabs({ tabs, searches }: NavTabsProps) {
  return (
    <nav className="role-tabs" aria-label="Section navigation">
      {tabs.map((tab) => (
        <NavLink key={tab.path} to={{ pathname: tab.path, search: searches[tab.path] ?? '' }} end>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
