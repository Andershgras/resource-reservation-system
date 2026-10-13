import { apiRequest } from './client'
import type {
  BookingPolicyResponse,
  CreateResourceRequest,
  ResourceScheduleResponse,
  ResourceResponse,
  UpdateResourceRequest,
} from './types'

export function getResources() {
  return apiRequest<ResourceResponse[]>('/resources')
}

// A booking being moved can be left out, so its own time shows as free. Only
// its owner or an admin can do that.
export function getResourceSchedule(id: number, from: string, to: string, excludeReservationId?: number) {
  const query = new URLSearchParams({ from, to })

  if (excludeReservationId !== undefined) {
    query.set('excludeReservationId', excludeReservationId.toString())
  }

  return apiRequest<ResourceScheduleResponse>(
    `/resources/${id}/schedule?${query.toString()}`,
  )
}

// The default booking rules, which resources use unless they override them.
export function getBookingPolicy() {
  return apiRequest<BookingPolicyResponse>('/bookingpolicy')
}

export function createResource(request: CreateResourceRequest) {
  return apiRequest<ResourceResponse>('/resources', {
    method: 'POST',
    body: request,
  })
}

export function updateResource(id: number, request: UpdateResourceRequest) {
  return apiRequest<void>(`/resources/${id}`, {
    method: 'PUT',
    body: request,
  })
}

export function deleteResource(id: number) {
  return apiRequest<void>(`/resources/${id}`, {
    method: 'DELETE',
  })
}
