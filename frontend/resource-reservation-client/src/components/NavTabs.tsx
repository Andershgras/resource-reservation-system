import { NavLink } from 'react-router'

export interface NavTab {
  path: string
  label: string
}

interface NavTabsProps {
  tabs: NavTab[]
}

// Links between the screens of a workspace. NavLink marks the current screen
// with the "active" class and aria-current="page".
export function NavTabs({ tabs }: NavTabsProps) {
  return (
    <nav className="role-tabs" aria-label="Section navigation">
      {tabs.map((tab) => (
        <NavLink key={tab.path} to={tab.path} end>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
