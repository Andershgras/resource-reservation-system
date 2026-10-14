import type { NavTab } from '../components/NavTabs'
import { useTabSearches } from '../components/useTabSearches'
import { useAvailabilities } from '../features/availability/availabilityQueries'
import { useAllReservations } from '../features/reservations/reservationQueries'
import { useResources } from '../features/resources/resourceQueries'
import { useAvailabilityRules } from '../features/weekly-schedule/availabilityRuleQueries'
import { WorkspaceLayout } from './WorkspaceLayout'

const adminTabs: NavTab[] = [
  { path: '/admin/resources', label: 'Resources' },
  { path: '/admin/calendar', label: 'Calendar' },
  { path: '/admin/availability', label: 'Availability' },
  { path: '/admin/weekly-schedule', label: 'Weekly schedule' },
  { path: '/admin/closures', label: 'Closures' },
  { path: '/admin/reservations', label: 'Reservations' },
  { path: '/admin/users', label: 'Users' },
]

// The admin workspace, with a summary of the booking setup.
export function AdminLayout() {
  const searches = useTabSearches(adminTabs)
  const resources = useResources().data ?? []
  const availabilities = useAvailabilities().data ?? []
  const availabilityRules = useAvailabilityRules().data ?? []
  const reservations = useAllReservations().data ?? []

  return (
    <WorkspaceLayout
      title="Booking operations"
      description="Manage what can be booked, when it is open, every reservation, and who can sign in."
      tabs={adminTabs}
      searches={searches}
      statsLabel="Admin summary"
      stats={[
        { label: 'Active resources', value: resources.filter((resource) => resource.isActive).length },
        { label: 'Availability windows', value: availabilities.length },
        { label: 'Weekly rules', value: availabilityRules.length },
        {
          label: 'Active reservations',
          value: reservations.filter((reservation) => reservation.status === 'Active').length,
        },
      ]}
    />
  )
}
