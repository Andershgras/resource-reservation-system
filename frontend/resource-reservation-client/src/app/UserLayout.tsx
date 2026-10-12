import { Outlet } from 'react-router'
import { useAuth, useCurrentUser } from '../auth/authContext'
import { HomeHeader } from '../components/HomeHeader'
import { NavTabs, type NavTab } from '../components/NavTabs'
import { useTabSearches } from '../components/useTabSearches'
import { useResourceSchedule } from '../features/booking/bookingQueries'
import { bookingSelectionFor } from '../features/booking/bookingSearch'
import { useMyReservations } from '../features/reservations/reservationQueries'
import { useResources } from '../features/resources/resourceQueries'

const userTabs: NavTab[] = [
  { path: '/book', label: 'Book resource' },
  { path: '/my-reservations', label: 'My reservations' },
]

// The user workspace: header, overview and tabs, with the current screen below.
// It stays mounted while switching tabs.
export function UserLayout() {
  const currentUser = useCurrentUser()
  const { logOut } = useAuth()
  const searches = useTabSearches(userTabs)
  const resources = useResources().data
  const reservations = useMyReservations().data ?? []
  // The schedule last shown on the booking screen, read from the cache.
  const schedule = useResourceSchedule(bookingSelectionFor(searches['/book'] ?? '', resources)).data
  const activeReservationCount = reservations.filter(
    (reservation) => reservation.status === 'Active',
  ).length

  return (
    <main className="app-shell">
      <section className="home-panel">
        <HomeHeader currentUser={currentUser} onLogout={logOut} />

        <section className="panel-section overview-panel" aria-labelledby="user-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">User overview</p>
              <h2 id="user-title">Your booking space</h2>
            </div>
          </div>
          <div className="summary-grid" aria-label="User summary">
            <div>
              <span>{resources?.length ?? 0}</span>
              <p>Resources</p>
            </div>
            <div>
              <span>{schedule?.bookableSlots.length ?? 0}</span>
              <p>Bookable slots</p>
            </div>
            <div>
              <span>{activeReservationCount}</span>
              <p>Active reservations</p>
            </div>
          </div>
        </section>

        <NavTabs tabs={userTabs} searches={searches} />

        <Outlet />
      </section>
    </main>
  )
}
