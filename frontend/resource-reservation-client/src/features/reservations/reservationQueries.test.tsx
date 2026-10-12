import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as reservationsApi from '../../api/reservationsApi'
import type { ReservationResponse } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { createQueryWrapper } from '../../test/queryWrapper'
import {
  useAllReservations,
  useCancelReservation,
  useCreateReservation,
  useMyReservations,
} from './reservationQueries'

vi.mock('../../api/reservationsApi')

const reservation: ReservationResponse = {
  id: 7,
  resourceId: 1,
  resourceName: 'Room',
  userId: 2,
  startTime: '2030-01-15T09:00:00',
  endTime: '2030-01-15T10:00:00',
  status: 'Active',
}

beforeEach(() => {
  vi.mocked(reservationsApi.getMyReservations).mockResolvedValue([reservation])
  vi.mocked(reservationsApi.getReservations).mockResolvedValue([reservation])
})

describe('reservation lists', () => {
  it('loads the user and admin lists from their own endpoints', async () => {
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => ({ mine: useMyReservations(), all: useAllReservations() }), { wrapper })

    await waitFor(() => expect(result.current.mine.data).toEqual([reservation]))
    await waitFor(() => expect(result.current.all.data).toEqual([reservation]))
  })
})

describe('useCancelReservation', () => {
  // Audit L2: the schedule kept showing a cancelled reservation as reserved.
  it('refreshes the booking schedules as well as the reservation lists', async () => {
    const { queryClient, wrapper } = createQueryWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCancelReservation(), { wrapper })

    await act(() => result.current.mutateAsync(7))

    expect(reservationsApi.cancelReservation).toHaveBeenCalledWith(7)
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.reservations,
      queryKeys.schedules,
    ])
  })
})

describe('useCreateReservation', () => {
  it('refreshes the reservation lists and schedules', async () => {
    const { queryClient, wrapper } = createQueryWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCreateReservation(), { wrapper })
    const request = { resourceId: 1, startTime: '2030-01-15T09:00', endTime: '2030-01-15T10:00' }

    await act(() => result.current.mutateAsync(request))

    expect(reservationsApi.createReservation).toHaveBeenCalledWith(request)
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.reservations,
      queryKeys.schedules,
    ])
  })
})
