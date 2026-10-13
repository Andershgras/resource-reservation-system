import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createResource,
  deleteResource,
  getBookingPolicy,
  getResources,
  updateResource,
} from '../../api/resourcesApi'
import type { CreateResourceRequest, UpdateResourceRequest } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { useInvalidateQueries } from '../../lib/useInvalidateQueries'

export function useResources() {
  return useQuery({ queryKey: queryKeys.resources, queryFn: getResources })
}

// The default booking rules, which come from the API's configuration.
export function useBookingPolicy() {
  return useQuery({ queryKey: queryKeys.bookingPolicy, queryFn: getBookingPolicy, staleTime: Infinity })
}

export type SaveResourceInput =
  | { id: null; request: CreateResourceRequest }
  | { id: number; request: UpdateResourceRequest }

// Resource names appear in every list, and deactivating a resource changes its
// schedule, so a change refreshes everything that shows resources.
function useInvalidateResourceData() {
  return useInvalidateQueries(
    queryKeys.resources,
    queryKeys.availabilities,
    queryKeys.availabilityRules,
    queryKeys.reservations,
    queryKeys.schedules,
  )
}

export function useSaveResource() {
  const invalidate = useInvalidateResourceData()

  return useMutation({
    mutationFn: async (input: SaveResourceInput) => {
      if (input.id === null) {
        await createResource(input.request)
      } else {
        await updateResource(input.id, input.request)
      }
    },
    onSuccess: invalidate,
  })
}

export function useDeleteResource() {
  const invalidate = useInvalidateResourceData()

  return useMutation({
    mutationFn: (id: number) => deleteResource(id),
    onSuccess: invalidate,
  })
}
