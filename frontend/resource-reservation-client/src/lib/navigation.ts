import type { UserRole } from '../api/types'

export function homePathFor(role: UserRole) {
  return role === 'Admin' ? '/admin/resources' : '/book'
}

// The login address that returns to `path` afterwards.
export function loginPathFor(path: string) {
  return path === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(path)}`
}

// Accepts only a path inside this app, so a crafted login link can't send the
// user to another site after they log in.
export function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null
  }

  return value
}
