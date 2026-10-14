import { apiRequest } from './client'
import type {
  AcceptedMessage,
  AuthResponse,
  LoginUserRequest,
  PasswordResetStatus,
  RegisterUserRequest,
  ResetPasswordRequest,
} from './types'

export function login(request: LoginUserRequest) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: request,
  })
}

// The same answer whether or not the address already has an account. A new
// account can't sign in until its email is confirmed.
export function register(request: RegisterUserRequest) {
  return apiRequest<AcceptedMessage>('/auth/register', {
    method: 'POST',
    body: request,
  })
}

export function resendVerification(email: string) {
  return apiRequest<AcceptedMessage>('/auth/resend-verification', {
    method: 'POST',
    body: { email },
  })
}

// Needs the account's password as well as the link, so a link sent to someone
// who didn't register can't activate the account.
export function verifyEmail(token: string, password: string) {
  return apiRequest<void>('/auth/verify-email', {
    method: 'POST',
    body: { token, password },
  })
}

export function forgotPassword(email: string) {
  return apiRequest<AcceptedMessage>('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  })
}

// Whether a reset link still works. Uses nothing up.
export function checkPasswordReset(token: string) {
  return apiRequest<PasswordResetStatus>('/auth/reset-password/check', {
    method: 'POST',
    body: { token },
  })
}

export function resetPassword(request: ResetPasswordRequest) {
  return apiRequest<void>('/auth/reset-password', {
    method: 'POST',
    body: request,
  })
}
