import { useMutation, useQuery } from '@tanstack/react-query'
import {
  cancelReservation,
  createReservation,
  getMyReservations,
  getReservations,
} from '../../api/reservationsApi'
import type { CreateReservationRequest } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { useInvalidateQueries } from '../../lib/useInvalidateQueries'

// Every reservation, for admins.
export function useAllReservations() {
  return useQuery({ queryKey: queryKeys.allReservations, queryFn: getReservations })
}

// The logged-in user's reservations.
export function useMyReservations() {
  return useQuery({ queryKey: queryKeys.myReservations, queryFn: getMyReservations })
}

// Booking or cancelling changes both the reservation lists and the free time in
// the booking schedule. Refreshing the schedule after a cancellation fixes
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

export function useCancelReservation() {
  const invalidate = useInvalidateReservationData()

  return useMutation({
    mutationFn: (id: number) => cancelReservation(id),
    onSuccess: invalidate,
  })
}
