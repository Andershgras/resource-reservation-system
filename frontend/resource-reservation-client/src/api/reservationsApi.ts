import { apiRequest } from './client'
import type { CreateReservationRequest, ReservationResponse } from './types'

export function createReservation(request: CreateReservationRequest) {
  return apiRequest<ReservationResponse>('/reservations', {
    method: 'POST',
    body: request,
  })
}

export function getMyReservations() {
  return apiRequest<ReservationResponse[]>('/reservations/me')
}
