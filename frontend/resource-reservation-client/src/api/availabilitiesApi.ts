import { apiRequest } from './client'
import type { AvailabilityResponse } from './types'

export function getAvailabilities() {
  return apiRequest<AvailabilityResponse[]>('/availabilities')
}
