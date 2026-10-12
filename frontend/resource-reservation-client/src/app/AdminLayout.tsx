import { Outlet } from 'react-router'
import { useAuth, useCurrentUser } from '../auth/authContext'
import { HomeHeader } from '../components/HomeHeader'
import { NavTabs, type NavTab } from '../components/NavTabs'
import { useAvailabilities } from '../features/availability/availabilityQueries'
import { useAllReservations } from '../features/reservations/reservationQueries'
import { useResources } from '../features/resources/resourceQueries'
import { useAvailabilityRules } from '../features/weekly-schedule/availabilityRuleQueries'

const adminTabs: NavTab[] = [
  { path: '/admin/resources', label: 'Resources' },
  { path: '/admin/availability', label: 'Availability' },
  { path: '/admin/weekly-schedule', label: 'Weekly schedule' },
  { path: '/admin/reservations', label: 'Reservations' },
]

// The admin workspace: header, overview and tabs, with the current screen below.
// It stays mounted while switching tabs.
export function AdminLayout() {
  const currentUser = useCurrentUser()
  const { logOut } = useAuth()
  const resources = useResources().data ?? []
  const availabilities = useAvailabilities().data ?? []
  const availabilityRules = useAvailabilityRules().data ?? []
  const reservations = useAllReservations().data ?? []
  const activeResourceCount = resources.filter((resource) => resource.isActive).length
  const activeReservationCount = reservations.filter(
    (reservation) => reservation.status === 'Active',
  ).length

  return (
    <main className="app-shell">
      <section className="home-panel">
        <HomeHeader currentUser={currentUser} onLogout={logOut} />

        <section className="panel-section overview-panel" aria-labelledby="admin-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Admin overview</p>
              <h2 id="admin-title">Booking operations</h2>
            </div>
          </div>
          <div className="summary-grid" aria-label="Admin summary">
            <div>
              <span>{activeResourceCount}</span>
              <p>Active resources</p>
            </div>
            <div>
              <span>{availabilities.length}</span>
              <p>Availability windows</p>
            </div>
            <div>
              <span>{availabilityRules.length}</span>
              <p>Weekly rules</p>
            </div>
            <div>
              <span>{activeReservationCount}</span>
              <p>Active reservations</p>
            </div>
          </div>
        </section>

        <NavTabs tabs={adminTabs} />

        <Outlet />
      </section>
    </main>
  )
}
