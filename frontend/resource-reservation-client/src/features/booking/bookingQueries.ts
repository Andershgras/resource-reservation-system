import { useQuery } from '@tanstack/react-query'
import { getResourceSchedule } from '../../api/resourcesApi'
import { queryKeys } from '../../lib/queryKeys'
import { weekRange, type BookingSelection } from './bookingSearch'

// The bookable and reserved time for one resource and week. Nothing is
// loaded until a resource is chosen.
export function useResourceSchedule({ resourceId, weekStart }: BookingSelection) {
  const { fromDate, toDate } = weekRange(weekStart)

  return useQuery({
    queryKey: queryKeys.schedule(resourceId ?? 0, fromDate, toDate),
    queryFn: () => getResourceSchedule(resourceId!, fromDate, toDate),
    enabled: resourceId !== null,
  })
}
