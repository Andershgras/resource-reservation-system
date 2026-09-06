import { apiRequest } from './client'
import type {
  AvailabilityResponse,
  CreateAvailabilityRequest,
  UpdateAvailabilityRequest,
} from './types'

export function getAvailabilities() {
  return apiRequest<AvailabilityResponse[]>('/availabilities')
}

export function createAvailability(request: CreateAvailabilityRequest) {
  return apiRequest<AvailabilityResponse>('/availabilities', {
    method: 'POST',
    body: request,
  })
}

export function updateAvailability(
  id: number,
  request: UpdateAvailabilityRequest,
) {
  return apiRequest<void>(`/availabilities/${id}`, {
    method: 'PUT',
    body: request,
  })
}
