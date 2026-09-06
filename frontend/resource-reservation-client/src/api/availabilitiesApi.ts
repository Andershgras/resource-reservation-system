import { apiRequest } from './client'
import type { AvailabilityResponse, CreateAvailabilityRequest } from './types'

export function getAvailabilities() {
  return apiRequest<AvailabilityResponse[]>('/availabilities')
}

export function createAvailability(request: CreateAvailabilityRequest) {
  return apiRequest<AvailabilityResponse>('/availabilities', {
    method: 'POST',
    body: request,
  })
}
