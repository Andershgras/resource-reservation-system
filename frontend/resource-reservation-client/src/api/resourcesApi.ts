import { apiRequest } from './client'
import type {
  CreateResourceRequest,
  ResourceResponse,
  UpdateResourceRequest,
} from './types'

export function getResources() {
  return apiRequest<ResourceResponse[]>('/resources')
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
