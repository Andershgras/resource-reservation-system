import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as resourcesApi from '../../api/resourcesApi'
import { queryKeys } from '../../lib/queryKeys'
import { createQueryWrapper } from '../../test/queryWrapper'
import { useDeleteResource, useResources, useSaveResource } from './resourceQueries'

vi.mock('../../api/resourcesApi')

const room = { id: 1, name: 'Room', description: null, location: null, isActive: true }

beforeEach(() => {
  vi.mocked(resourcesApi.getResources).mockResolvedValue([room])
})

describe('useResources', () => {
  it('loads the resources', async () => {
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useResources(), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual([room]))
  })

  it('reports a failed load without retrying', async () => {
    vi.mocked(resourcesApi.getResources).mockRejectedValue(new Error('Network down'))
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useResources(), { wrapper })

    await waitFor(() => expect(result.current.error).toEqual(new Error('Network down')))
    expect(resourcesApi.getResources).toHaveBeenCalledOnce()
  })
})

describe('useSaveResource', () => {
  it('creates a new resource', async () => {
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSaveResource(), { wrapper })

    await act(() => result.current.mutateAsync({ id: null, request: { name: 'Lab', description: null, location: null } }))

    expect(resourcesApi.createResource).toHaveBeenCalledWith({ name: 'Lab', description: null, location: null })
    expect(resourcesApi.updateResource).not.toHaveBeenCalled()
  })

  it('updates an existing resource', async () => {
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSaveResource(), { wrapper })
    const request = { name: 'Lab', description: null, location: null, isActive: false }

    await act(() => result.current.mutateAsync({ id: 4, request }))

    expect(resourcesApi.updateResource).toHaveBeenCalledWith(4, request)
  })

  it('refreshes everything that shows resource names, and waits for the list', async () => {
    const { queryClient, wrapper } = createQueryWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => ({ list: useResources(), save: useSaveResource() }), { wrapper })
    await waitFor(() => expect(result.current.list.data).toEqual([room]))
    const renamed = { ...room, name: 'Renamed room' }
    vi.mocked(resourcesApi.getResources).mockResolvedValue([renamed])

    await act(() => result.current.save.mutateAsync({ id: 1, request: { ...renamed } }))

    // The new list is already cached when the save finishes. Components see it
    // on the next tick.
    expect(queryClient.getQueryData(queryKeys.resources)).toEqual([renamed])
    await waitFor(() => expect(result.current.list.data).toEqual([renamed]))
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.resources,
      queryKeys.availabilities,
      queryKeys.availabilityRules,
      queryKeys.reservations,
      queryKeys.schedules,
    ])
  })
})

describe('useDeleteResource', () => {
  it('deletes the resource and refreshes the list', async () => {
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => ({ list: useResources(), remove: useDeleteResource() }), { wrapper })
    await waitFor(() => expect(result.current.list.data).toEqual([room]))
    vi.mocked(resourcesApi.getResources).mockResolvedValue([])

    await act(() => result.current.remove.mutateAsync(1))

    expect(resourcesApi.deleteResource).toHaveBeenCalledWith(1)
    await waitFor(() => expect(result.current.list.data).toEqual([]))
  })
})
