import { useMutation, useQuery } from '@tanstack/react-query'
import {
  cancelReservation,
  createReservation,
  getMyReservations,
  getReservation,
  getReservations,
  getResourceReservations,
  rescheduleReservation,
} from '../../api/reservationsApi'
import type {
  CreateReservationRequest,
  RescheduleReservationRequest,
  ReservationResponse,
} from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { liveQueryOptions } from '../booking/bookingQueries'
import { weekRange } from '../booking/bookingSearch'
import { useInvalidateQueries } from '../../lib/useInvalidateQueries'

// Every reservation, for admins.
export function useAllReservations() {
  return useQuery({ queryKey: queryKeys.allReservations, queryFn: getReservations })
}

// The logged-in user's reservations.
export function useMyReservations() {
  return useQuery({ queryKey: queryKeys.myReservations, queryFn: getMyReservations })
}

// A resource's bookings in one week, with who booked them, for the admin
// calendar. Like the calendar, it reloads while on screen.
export function useResourceReservations(resourceId: number | null, weekStart: string) {
  const { fromDate, toDate } = weekRange(weekStart)

  return useQuery({
    queryKey: queryKeys.resourceReservations(resourceId ?? 0, fromDate, toDate),
    queryFn: () => getResourceReservations(resourceId!, fromDate, toDate),
    enabled: resourceId !== null,
    ...liveQueryOptions,
  })
}

// One reservation, such as the one being moved. Nothing loads for null.
export function useReservation(id: number | null) {
  return useQuery({
    queryKey: queryKeys.reservation(id ?? 0),
    queryFn: () => getReservation(id!),
    enabled: id !== null,
  })
}

// Booking, moving or cancelling changes both the reservation lists and the free
// time in the booking schedule. Refreshing the schedule after a cancellation fixes
// audit L2, where the cancelled time stayed shown as reserved.
function useInvalidateReservationData() {
  return useInvalidateQueries(queryKeys.reservations, queryKeys.schedules)
}

export function useCreateReservation() {
  const invalidate = useInvalidateReservationData()

  return useMutation({
    mutationFn: (request: CreateReservationRequest) => createReservation(request),
    onSuccess: invalidate,
  })
}

export function useRescheduleReservation() {
  const invalidate = useInvalidateReservationData()

  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: RescheduleReservationRequest }) =>
      rescheduleReservation(id, request),
    // Also after a failure: a 409 means the lists are out of date.
    onSettled: invalidate,
  })
}

// Sends the version that was shown, so a reservation changed meanwhile isn't
// cancelled by mistake.
export function useCancelReservation() {
  const invalidate = useInvalidateReservationData()

  return useMutation({
    mutationFn: (reservation: Pick<ReservationResponse, 'id' | 'version'>) =>
      cancelReservation(reservation.id, reservation.version),
    // Also after a failure: a 409 means the lists are out of date.
    onSettled: invalidate,
  })
}
