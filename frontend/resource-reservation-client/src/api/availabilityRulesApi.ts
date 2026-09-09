import { apiRequest } from './client'
import type {
  AvailabilityRuleResponse,
  CreateAvailabilityRuleRequest,
  UpdateAvailabilityRuleRequest,
} from './types'

export function getAvailabilityRules() {
  return apiRequest<AvailabilityRuleResponse[]>('/availabilityrules')
}

export function createAvailabilityRule(request: CreateAvailabilityRuleRequest) {
  return apiRequest<AvailabilityRuleResponse>('/availabilityrules', {
    method: 'POST',
    body: request,
  })
}

export function updateAvailabilityRule(
  id: number,
  request: UpdateAvailabilityRuleRequest,
) {
  return apiRequest<void>(`/availabilityrules/${id}`, {
    method: 'PUT',
    body: request,
  })
}

export function deleteAvailabilityRule(id: number) {
  return apiRequest<void>(`/availabilityrules/${id}`, {
    method: 'DELETE',
  })
}
