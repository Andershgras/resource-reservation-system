import { useQuery } from '@tanstack/react-query'
import { getResourceSchedule } from '../../api/resourcesApi'
import { queryKeys } from '../../lib/queryKeys'
import { weekRange, type BookingSelection } from './bookingSearch'

// How often a calendar on screen reloads, so other people's bookings show up.
export const liveRefreshMilliseconds = 60_000

// For a calendar on screen: reload when the window regains focus, and every
// minute while the page is visible. TanStack Query pauses the interval while
// the window is hidden or unfocused, and a screen that isn't shown has no
// query to refresh. The key stays the same, so the resource and week don't
// change.
export const liveQueryOptions = {
  refetchOnWindowFocus: 'always',
  refetchInterval: liveRefreshMilliseconds,
  refetchIntervalInBackground: false,
} as const

// The bookable, reserved and closed time for one resource and week. Nothing is
// loaded until a resource is chosen. While a booking is being moved, its own
// time shows as free.
export function useResourceSchedule(
  { resourceId, weekStart, moveReservationId }: BookingSelection,
  { live = false }: { live?: boolean } = {},
) {
  const { fromDate, toDate } = weekRange(weekStart)

  return useQuery({
    queryKey: queryKeys.schedule(resourceId ?? 0, fromDate, toDate, moveReservationId),
    queryFn: () => getResourceSchedule(resourceId!, fromDate, toDate, moveReservationId ?? undefined),
    enabled: resourceId !== null,
    ...(live ? liveQueryOptions : {}),
  })
}
