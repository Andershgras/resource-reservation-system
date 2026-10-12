import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as availabilitiesApi from '../../api/availabilitiesApi'
import * as availabilityRulesApi from '../../api/availabilityRulesApi'
import { queryKeys } from '../../lib/queryKeys'
import { createQueryWrapper } from '../../test/queryWrapper'
import { useAvailabilityRules, useSaveAvailabilityRule } from '../weekly-schedule/availabilityRuleQueries'
import { useDeleteAvailability, useSaveAvailability } from './availabilityQueries'

vi.mock('../../api/availabilitiesApi')
vi.mock('../../api/availabilityRulesApi')

function invalidatedKeys(invalidate: { mock: { calls: unknown[][] } }) {
  return invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown }).queryKey)
}

describe('availability windows', () => {
  it('creates or updates a window and refreshes the windows and schedules', async () => {
    const { queryClient, wrapper } = createQueryWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSaveAvailability(), { wrapper })
    const request = { resourceId: 1, startTime: '2030-01-15T09:00', endTime: '2030-01-15T10:00' }

    await act(() => result.current.mutateAsync({ id: null, request }))
    await act(() => result.current.mutateAsync({ id: 5, request }))

    expect(availabilitiesApi.createAvailability).toHaveBeenCalledWith(request)
    expect(availabilitiesApi.updateAvailability).toHaveBeenCalledWith(5, request)
    expect(invalidatedKeys(invalidate)).toEqual([
      queryKeys.availabilities, queryKeys.schedules,
      queryKeys.availabilities, queryKeys.schedules,
    ])
  })

  it('deletes a window', async () => {
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useDeleteAvailability(), { wrapper })

    await act(() => result.current.mutateAsync(5))

    expect(availabilitiesApi.deleteAvailability).toHaveBeenCalledWith(5)
  })
})

describe('weekly rules', () => {
  it('loads the rules', async () => {
    vi.mocked(availabilityRulesApi.getAvailabilityRules).mockResolvedValue([])
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useAvailabilityRules(), { wrapper })

    await vi.waitFor(() => expect(result.current.data).toEqual([]))
  })

  it('saves a rule and refreshes the rules and schedules', async () => {
    const { queryClient, wrapper } = createQueryWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSaveAvailabilityRule(), { wrapper })
    const request = { resourceId: 1, dayOfWeek: 1, startTime: '08:00', endTime: '16:00' }

    await act(() => result.current.mutateAsync({ id: null, request }))

    expect(availabilityRulesApi.createAvailabilityRule).toHaveBeenCalledWith(request)
    expect(invalidatedKeys(invalidate)).toEqual([queryKeys.availabilityRules, queryKeys.schedules])
  })
})
