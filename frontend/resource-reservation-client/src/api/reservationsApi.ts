import { apiRequest } from './client'
import type {
  CreateReservationRequest,
  RescheduleReservationRequest,
  ReservationResponse,
} from './types'

export function createReservation(request: CreateReservationRequest) {
  return apiRequest<ReservationResponse>('/reservations', {
    method: 'POST',
    body: request,
  })
}

export function getReservation(id: number) {
  return apiRequest<ReservationResponse>(`/reservations/${id}`)
}

export function getMyReservations() {
  return apiRequest<ReservationResponse[]>('/reservations/me')
}

export function getReservations() {
  return apiRequest<ReservationResponse[]>('/reservations')
}

export function rescheduleReservation(id: number, request: RescheduleReservationRequest) {
  return apiRequest<ReservationResponse>(`/reservations/${id}`, {
    method: 'PUT',
    body: request,
  })
}

// The version makes the API refuse the cancellation if the reservation has
// changed since it was shown.
export function cancelReservation(id: number, version: string) {
  return apiRequest<void>(`/reservations/${id}/cancel`, {
    method: 'PUT',
    body: { version },
  })
}
