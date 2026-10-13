import { apiRequest } from './client'
import type {
  ClosureCreatedResponse,
  ClosureResponse,
  CreateClosureRequest,
  ReservationResponse,
} from './types'

// Closures (availability exceptions in the API). Admin only.
export function getClosures() {
  return apiRequest<ClosureResponse[]>('/availabilityexceptions')
}

// The active reservations a closure would cover. Nothing is saved.
export function previewClosure(request: CreateClosureRequest) {
  return apiRequest<ReservationResponse[]>('/availabilityexceptions/preview', {
    method: 'POST',
    body: request,
  })
}

// Returns the closure and the reservations inside it when it was saved,
// which may differ from the preview. They are not cancelled.
export function createClosure(request: CreateClosureRequest) {
  return apiRequest<ClosureCreatedResponse>('/availabilityexceptions', {
    method: 'POST',
    body: request,
  })
}

export function deleteClosure(id: number) {
  return apiRequest<void>(`/availabilityexceptions/${id}`, {
    method: 'DELETE',
  })
}
