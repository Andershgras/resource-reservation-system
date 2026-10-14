import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { changeUserRole, changeUserStatus, getUsers } from '../../api/usersApi'
import type { UserAccountResponse, UserRole } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { useInvalidateQueries } from '../../lib/useInvalidateQueries'

// The previous page stays on screen while the next one loads.
export function useUsers(search: string, page: number) {
  return useQuery({
    queryKey: queryKeys.userPage(search, page),
    queryFn: () => getUsers(search, page),
    placeholderData: keepPreviousData,
  })
}

// Reservation lists show user names, but a role or status change doesn't
// alter them, so only the user lists reload.
export function useChangeUserRole() {
  const invalidate = useInvalidateQueries(queryKeys.users)

  return useMutation({
    mutationFn: ({ user, role }: { user: UserAccountResponse; role: UserRole }) => changeUserRole(user.id, role),
    onSettled: invalidate,
  })
}

export function useChangeUserStatus() {
  const invalidate = useInvalidateQueries(queryKeys.users)

  return useMutation({
    mutationFn: ({ user, isActive }: { user: UserAccountResponse; isActive: boolean }) =>
      changeUserStatus(user.id, isActive),
    onSettled: invalidate,
  })
}
