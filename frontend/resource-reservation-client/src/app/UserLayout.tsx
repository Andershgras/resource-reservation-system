import type { NavTab } from '../components/NavTabs'
import { useTabSearches } from '../components/useTabSearches'
import { useResourceSchedule } from '../features/booking/bookingQueries'
import { bookingSelectionFor } from '../features/booking/bookingSearch'
import { useMyReservations } from '../features/reservations/reservationQueries'
import { useResources } from '../features/resources/resourceQueries'
import { WorkspaceLayout } from './WorkspaceLayout'

const userTabs: NavTab[] = [
  { path: '/book', label: 'Book resource' },
  { path: '/my-reservations', label: 'My reservations' },
]

// The user workspace, with a summary of the user's bookings.
export function UserLayout() {
  const searches = useTabSearches(userTabs)
  const resources = useResources().data
  const reservations = useMyReservations().data ?? []
  // The schedule last shown on the booking screen, read from the cache.
  const schedule = useResourceSchedule(bookingSelectionFor(searches['/book'] ?? '', resources)).data

  return (
    <WorkspaceLayout
      title="Your booking space"
      description="Find a free time for a resource and keep track of your reservations. Times are Copenhagen time."
      tabs={userTabs}
      searches={searches}
      statsLabel="User summary"
      stats={[
        { label: 'Resources', value: resources?.length ?? 0 },
        { label: 'Bookable slots', value: schedule?.bookableSlots.length ?? 0 },
        {
          label: 'Active reservations',
          value: reservations.filter((reservation) => reservation.status === 'Active').length,
        },
      ]}
    />
  )
}
