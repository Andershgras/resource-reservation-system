import { apiRequest } from './client'
import type { UserAccountPage, UserAccountResponse, UserRole } from './types'

export const userPageSize = 25

// User accounts. Admin only.
export function getUsers(search: string, page: number) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(userPageSize) })

  if (search) {
    query.set('search', search)
  }

  return apiRequest<UserAccountPage>(`/users?${query}`)
}

// The user's existing sessions end, so they sign in again with the new role.
export function changeUserRole(id: number, role: UserRole) {
  return apiRequest<UserAccountResponse>(`/users/${id}/role`, {
    method: 'PUT',
    body: { role },
  })
}

// Deactivating ends the user's sessions and stops them signing in. Their
// reservations are kept.
export function changeUserStatus(id: number, isActive: boolean) {
  return apiRequest<UserAccountResponse>(`/users/${id}/status`, {
    method: 'PUT',
    body: { isActive },
  })
}
