import { NavLink } from 'react-router'
import './NavTabs.css'

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
    <nav className="section-nav" aria-label="Section navigation">
      <ul>
        {tabs.map((tab) => (
          <li key={tab.path}>
            <NavLink to={{ pathname: tab.path, search: searches[tab.path] ?? '' }} end>
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
