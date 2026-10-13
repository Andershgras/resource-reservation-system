import { useEffect, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useAuth, useCurrentUser } from '../auth/authContext'
import { NavTabs, type NavTab } from '../components/NavTabs'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { mainContentId } from '../ui/ConfirmDialog'
import { PageHeader } from '../ui/PageHeader'
import './WorkspaceLayout.css'

export interface WorkspaceStat {
  label: string
  value: number
}

interface WorkspaceLayoutProps {
  title: string
  description: ReactNode
  tabs: NavTab[]
  // Each tab's last search part, from useTabSearches.
  searches: Record<string, string>
  stats: WorkspaceStat[]
  statsLabel: string
}

const appName = 'Resource Reservation'

// The frame around every screen of a workspace: header with navigation and
// the user, the workspace title and summary, then the current screen. It stays
// mounted while switching tabs.
export function WorkspaceLayout({
  title,
  description,
  tabs,
  searches,
  stats,
  statsLabel,
}: WorkspaceLayoutProps) {
  const currentUser = useCurrentUser()
  const { logOut } = useAuth()
  const { pathname } = useLocation()
  const currentTab = tabs.find((tab) => tab.path === pathname)

  // Screen readers announce the new title after each move between screens.
  useEffect(() => {
    document.title = currentTab ? `${currentTab.label} · ${appName}` : appName
  }, [currentTab])

  return (
    <div className="workspace">
      <a className="skip-link" href={`#${mainContentId}`}>
        Skip to main content
      </a>

      <header className="workspace-header">
        <div className="workspace-header-inner">
          <p className="workspace-brand">
            <span className="workspace-brand-mark" aria-hidden="true">RR</span>
            <span>{appName}</span>
          </p>

          <NavTabs tabs={tabs} searches={searches} />

          <div className="workspace-user">
            <div className="workspace-user-text">
              <span className="workspace-user-name">{currentUser.name}</span>
              <span className="workspace-user-email">{currentUser.email}</span>
            </div>
            <Badge tone="primary">{currentUser.role}</Badge>
            <ThemeSwitcher />
            <Button size="sm" onClick={logOut}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main id={mainContentId} className="workspace-main" tabIndex={-1}>
        <PageHeader title={title} description={description} />

        <dl className="workspace-stats" aria-label={statsLabel}>
          {stats.map((stat) => (
            <div key={stat.label} className="workspace-stat">
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>

        <div className="workspace-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
