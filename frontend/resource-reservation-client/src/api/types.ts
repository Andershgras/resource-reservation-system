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
  // When the token stops being accepted, as an ISO 8601 UTC time.
  expiresAt: string
  // The token lifetime, counted from when the response was sent.
  expiresInSeconds: number
  user: UserResponse
}

// A user account as admins see it.
export interface UserAccountResponse {
  id: number
  name: string
  email: string
  role: UserRole
  isActive: boolean
  // False until the owner confirms the address. Such accounts can't sign in.
  isEmailConfirmed: boolean
  // Null for accounts created before it was recorded.
  createdAt: string | null
}

export interface UserAccountPage {
  items: UserAccountResponse[]
  // Matching accounts across all pages.
  totalCount: number
  page: number
  pageSize: number
}

export interface RegisterUserRequest {
  name: string
  email: string
  password: string
}

// The one answer to a request that may send an email, whatever happened.
export interface AcceptedMessage {
  message: string
}

export interface PasswordResetStatus {
  // The account was never confirmed, so the reset sets it up again and also
  // asks for a name.
  completesRegistration: boolean
}

export interface ResetPasswordRequest {
  token: string
  password: string
  name?: string
}

export interface LoginUserRequest {
  email: string
  password: string
}

// A resource's own booking rules. Null means it uses the default.
export interface BookingRuleOverrides {
  minDurationMinutes: number | null
  maxDurationMinutes: number | null
  minLeadTimeMinutes: number | null
  maxAdvanceDays: number | null
}

export interface ResourceResponse extends BookingRuleOverrides {
  id: number
  name: string
  description: string | null
  location: string | null
  isActive: boolean
}

export interface CreateResourceRequest extends Partial<BookingRuleOverrides> {
  name: string
  description?: string | null
  location?: string | null
}

// The booking rules in force: the defaults, or a resource's rules after its
// overrides.
export interface BookingPolicyResponse {
  minDurationMinutes: number
  maxDurationMinutes: number
  minLeadTimeMinutes: number
  maxAdvanceDays: number
  maxActiveReservationsPerUser: number
}

export interface UpdateResourceRequest extends CreateResourceRequest {
  isActive: boolean
}

export interface BookableSlotResponse {
  startTime: string
  endTime: string
}

export interface ReservedSlotResponse {
  startTime: string
  endTime: string
}

// Opening hours a closure takes away, with the reason of each closure that
// covers them.
export interface ClosedSlotResponse {
  startTime: string
  endTime: string
  reasons: string[]
}

export interface ResourceScheduleResponse {
  resourceId: number
  resourceName: string
  fromDate: string
  toDate: string
  policy: BookingPolicyResponse
  bookableSlots: BookableSlotResponse[]
  reservedSlots: ReservedSlotResponse[]
  closedSlots: ClosedSlotResponse[]
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

export interface AvailabilityRuleResponse {
  id: number
  resourceId: number
  resourceName: string
  dayOfWeek: number
  dayName: string
  startTime: string
  endTime: string
}

export interface CreateAvailabilityRuleRequest {
  resourceId: number
  dayOfWeek: number
  startTime: string
  endTime: string
}

export type UpdateAvailabilityRuleRequest = CreateAvailabilityRuleRequest

export interface ReservationResponse {
  id: number
  resourceId: number
  resourceName: string
  userId: number
  userName: string
  userEmail: string
  startTime: string
  endTime: string
  status: ReservationStatus
  // UTC instants with an offset, unlike the wall-clock booking times. Null
  // for reservations made before they were recorded.
  createdAt: string | null
  updatedAt: string | null
  cancelledAt: string | null
  cancelledByUserId: number | null
  cancelledByName: string | null
  // Opaque. Sent back when moving or cancelling, so a change based on an
  // out-of-date copy is rejected.
  version: string
}

export interface CreateReservationRequest {
  resourceId: number
  startTime: string
  endTime: string
}

export interface RescheduleReservationRequest {
  startTime: string
  endTime: string
  version: string
}

// A closure: time a resource can't be booked, such as a holiday. Times are
// wall-clock times; createdAt is a UTC instant.
export interface ClosureResponse {
  id: number
  resourceId: number
  resourceName: string
  startTime: string
  endTime: string
  reason: string
  createdAt: string
  createdByName: string | null
}

export interface CreateClosureRequest {
  resourceId: number
  startTime: string
  endTime: string
  reason: string
}

export interface ClosureCreatedResponse {
  closure: ClosureResponse
  affectedReservations: ReservationResponse[]
}
