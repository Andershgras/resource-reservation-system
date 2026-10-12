import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createResource, deleteResource, getResources, updateResource } from '../../api/resourcesApi'
import type { CreateResourceRequest, UpdateResourceRequest } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'

export function useResources() {
  return useQuery({ queryKey: queryKeys.resources, queryFn: getResources })
}

export type SaveResourceInput =
  | { id: null; request: CreateResourceRequest }
  | { id: number; request: UpdateResourceRequest }

// Resource names appear in every list, and deactivating a resource changes its
// schedule, so a change refreshes everything that shows resources. The mutation
// resolves once the refreshed data has loaded.
function useInvalidateResourceData() {
  const queryClient = useQueryClient()

  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.resources }),
    queryClient.invalidateQueries({ queryKey: queryKeys.availabilities }),
    queryClient.invalidateQueries({ queryKey: queryKeys.availabilityRules }),
    queryClient.invalidateQueries({ queryKey: queryKeys.reservations }),
    queryClient.invalidateQueries({ queryKey: queryKeys.schedules }),
  ])
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
