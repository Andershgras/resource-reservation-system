export type UserRole = 'Admin' | 'User'

export type ReservationStatus = 'Active' | 'Cancelled'

export interface UserResponse {
  id: number
  name: string
  email: string
  role: UserRole
}

export interface AuthResponse {
  token: string
  user: UserResponse
}

export interface RegisterUserRequest {
  name: string
  email: string
  password: string
}

export interface LoginUserRequest {
  email: string
  password: string
}

export interface ResourceResponse {
  id: number
  name: string
  description: string | null
  location: string | null
  isActive: boolean
}

export interface CreateResourceRequest {
  name: string
  description?: string | null
  location?: string | null
}

export interface UpdateResourceRequest extends CreateResourceRequest {
  isActive: boolean
}

export interface AvailabilityResponse {
  id: number
  resourceId: number
  resourceName: string
  startTime: string
  endTime: string
}

export interface CreateAvailabilityRequest {
  resourceId: number
  startTime: string
  endTime: string
}

export type UpdateAvailabilityRequest = CreateAvailabilityRequest

export interface ReservationResponse {
  id: number
  resourceId: number
  resourceName: string
  userId: number
  startTime: string
  endTime: string
  status: ReservationStatus
}

export interface CreateReservationRequest {
  resourceId: number
  startTime: string
  endTime: string
}
