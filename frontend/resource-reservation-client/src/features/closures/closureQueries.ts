import { useMutation, useQuery } from '@tanstack/react-query'
import { createClosure, deleteClosure, getClosures, previewClosure } from '../../api/closuresApi'
import type { CreateClosureRequest } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { useInvalidateQueries } from '../../lib/useInvalidateQueries'

export function useClosures() {
  return useQuery({ queryKey: queryKeys.closures, queryFn: getClosures })
}

// A preview reads only, so it changes nothing on screen.
export function usePreviewClosure() {
  return useMutation({ mutationFn: (request: CreateClosureRequest) => previewClosure(request) })
}

// A closure changes the free time in every calendar of its resource.
function useInvalidateClosureData() {
  return useInvalidateQueries(queryKeys.closures, queryKeys.schedules)
}

export function useCreateClosure() {
  const invalidate = useInvalidateClosureData()

  return useMutation({
    mutationFn: (request: CreateClosureRequest) => createClosure(request),
    onSuccess: invalidate,
  })
}

export function useDeleteClosure() {
  const invalidate = useInvalidateClosureData()

  return useMutation({
    mutationFn: (id: number) => deleteClosure(id),
    onSuccess: invalidate,
  })
}
