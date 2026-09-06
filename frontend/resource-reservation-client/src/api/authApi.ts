import { apiRequest } from './client'
import type {
  AuthResponse,
  LoginUserRequest,
  RegisterUserRequest,
  UserResponse,
} from './types'

export function login(request: LoginUserRequest) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: request,
  })
}

export function register(request: RegisterUserRequest) {
  return apiRequest<UserResponse>('/auth/register', {
    method: 'POST',
    body: request,
  })
}
