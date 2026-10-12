import { useQuery } from '@tanstack/react-query'
import { getResourceSchedule } from '../../api/resourcesApi'
import { queryKeys } from '../../lib/queryKeys'
import type { BookingSelection } from './bookingSearch'

// The bookable and reserved time for one resource and date range. Nothing is
// loaded until a resource is chosen.
export function useResourceSchedule({ resourceId, fromDate, toDate }: BookingSelection) {
  return useQuery({
    queryKey: queryKeys.schedule(resourceId ?? 0, fromDate, toDate),
    queryFn: () => getResourceSchedule(resourceId!, fromDate, toDate),
    enabled: resourceId !== null,
  })
}
