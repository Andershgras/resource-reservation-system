import { apiRequest } from './client'
import type { ResourceResponse } from './types'

export function getResources() {
  return apiRequest<ResourceResponse[]>('/resources')
}
