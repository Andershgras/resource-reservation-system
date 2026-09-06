import { apiRequest } from './client'
import type { CreateResourceRequest, ResourceResponse } from './types'

export function getResources() {
  return apiRequest<ResourceResponse[]>('/resources')
}

export function createResource(request: CreateResourceRequest) {
  return apiRequest<ResourceResponse>('/resources', {
    method: 'POST',
    body: request,
  })
}
