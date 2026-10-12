import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createAvailability,
  deleteAvailability,
  getAvailabilities,
  updateAvailability,
} from '../../api/availabilitiesApi'
import type { CreateAvailabilityRequest } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { useInvalidateQueries } from '../../lib/useInvalidateQueries'

// One-off availability windows.
export function useAvailabilities() {
  return useQuery({ queryKey: queryKeys.availabilities, queryFn: getAvailabilities })
}

export interface SaveAvailabilityInput {
  id: number | null
  request: CreateAvailabilityRequest
}

// A window changes what the booking schedule offers.
function useInvalidateAvailabilityData() {
  return useInvalidateQueries(queryKeys.availabilities, queryKeys.schedules)
}

export function useSaveAvailability() {
  const invalidate = useInvalidateAvailabilityData()

  return useMutation({
    mutationFn: async ({ id, request }: SaveAvailabilityInput) => {
      if (id === null) {
        await createAvailability(request)
      } else {
        await updateAvailability(id, request)
      }
    },
    onSuccess: invalidate,
  })
}

export function useDeleteAvailability() {
  const invalidate = useInvalidateAvailabilityData()

  return useMutation({
    mutationFn: (id: number) => deleteAvailability(id),
    onSuccess: invalidate,
  })
}
