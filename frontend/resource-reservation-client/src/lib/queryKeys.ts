// Cache keys for server data. Keys are nested, so invalidating a prefix such as
// queryKeys.reservations also refreshes the user's and the admin's lists.
export const queryKeys = {
  resources: ['resources'] as const,
  availabilities: ['availabilities'] as const,
  availabilityRules: ['availability-rules'] as const,
  reservations: ['reservations'] as const,
  allReservations: ['reservations', 'all'] as const,
  myReservations: ['reservations', 'mine'] as const,
  reservation: (id: number) => ['reservations', 'detail', id] as const,
  bookingPolicy: ['booking-policy'] as const,
  schedules: ['schedules'] as const,
  // The schedule as seen while moving a booking leaves that booking out.
  schedule: (resourceId: number, fromDate: string, toDate: string, excludeReservationId: number | null = null) =>
    ['schedules', resourceId, fromDate, toDate, excludeReservationId] as const,
}
