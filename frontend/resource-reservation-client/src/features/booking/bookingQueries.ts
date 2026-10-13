import { useQuery } from '@tanstack/react-query'
import { getResourceSchedule } from '../../api/resourcesApi'
import { queryKeys } from '../../lib/queryKeys'
import { weekRange, type BookingSelection } from './bookingSearch'

// The bookable and reserved time for one resource and week. Nothing is
// loaded until a resource is chosen. While a booking is being moved, its own
// time shows as free.
export function useResourceSchedule({ resourceId, weekStart, moveReservationId }: BookingSelection) {
  const { fromDate, toDate } = weekRange(weekStart)

  return useQuery({
    queryKey: queryKeys.schedule(resourceId ?? 0, fromDate, toDate, moveReservationId),
    queryFn: () => getResourceSchedule(resourceId!, fromDate, toDate, moveReservationId ?? undefined),
    enabled: resourceId !== null,
  })
}
