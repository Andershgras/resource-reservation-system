import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as reservationsApi from '../../api/reservationsApi'
import * as resourcesApi from '../../api/resourcesApi'
import type { ReservationResponse, ResourceScheduleResponse } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { createQueryWrapper } from '../../test/queryWrapper'
import { useResourceSchedule } from '../booking/bookingQueries'
import { newReservationFields, testPolicy } from '../../test/fixtures'
import {
  useAllReservations,
  useCancelReservation,
  useCreateReservation,
  useMyReservations,
} from './reservationQueries'

vi.mock('../../api/reservationsApi')
vi.mock('../../api/resourcesApi')

const reservation: ReservationResponse = {
  id: 7,
  resourceId: 1,
  resourceName: 'Room',
  userId: 2,
  userName: 'Test User',
  userEmail: 'user@example.com',
  startTime: '2030-01-15T09:00:00',
  endTime: '2030-01-15T10:00:00',
  status: 'Active',
  ...newReservationFields,
}

function schedule(reservedSlots: ResourceScheduleResponse['reservedSlots']): ResourceScheduleResponse {
  return {
    resourceId: 1,
    resourceName: 'Room',
    fromDate: '2030-01-15',
    toDate: '2030-01-15',
    policy: testPolicy,
    bookableSlots: [],
    reservedSlots,
  }
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

    await act(() => result.current.mutateAsync(reservation))

    expect(reservationsApi.cancelReservation).toHaveBeenCalledWith(7, reservation.version)
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.reservations,
      queryKeys.schedules,
    ])
  })
})

describe('useCancelReservation with a schedule on screen', () => {
  // Audit L2: the schedule kept showing a cancelled reservation as reserved.
  it('refreshes the booking schedule as well as the reservation lists', async () => {
    vi.mocked(resourcesApi.getResourceSchedule).mockResolvedValue(schedule([
      { startTime: reservation.startTime, endTime: reservation.endTime },
    ]))
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => ({
      schedule: useResourceSchedule({ resourceId: 1, weekStart: '2030-01-14', moveReservationId: null }),
      mine: useMyReservations(),
      cancel: useCancelReservation(),
    }), { wrapper })
    await waitFor(() => expect(result.current.schedule.data?.reservedSlots).toHaveLength(1))
    vi.mocked(resourcesApi.getResourceSchedule).mockResolvedValue(schedule([]))
    vi.mocked(reservationsApi.getMyReservations).mockResolvedValue([{ ...reservation, status: 'Cancelled' }])

    await act(() => result.current.cancel.mutateAsync(reservation))

    expect(reservationsApi.cancelReservation).toHaveBeenCalledWith(7, reservation.version)
    await waitFor(() => expect(result.current.schedule.data?.reservedSlots).toEqual([]))
    await waitFor(() => expect(result.current.mine.data?.[0].status).toBe('Cancelled'))
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
