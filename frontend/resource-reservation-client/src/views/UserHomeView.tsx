import type {
  AvailabilityResponse,
  ReservationResponse,
  ResourceResponse,
  UserResponse,
} from '../api/types'
import { AvailabilitySection } from '../components/AvailabilitySection'
import { HomeHeader } from '../components/HomeHeader'
import { ReservationsSection } from '../components/ReservationsSection'
import { ResourcesSection } from '../components/ResourcesSection'

interface UserHomeViewProps {
  currentUser: UserResponse
  onLogout: () => void
  resources: ResourceResponse[]
  resourceMessage: string
  isLoadingResources: boolean
  availabilities: AvailabilityResponse[]
  availabilityMessage: string
  isLoadingAvailabilities: boolean
  reservations: ReservationResponse[]
  reservationMessage: string
  myReservationsMessage: string
  isLoadingReservations: boolean
  reservingAvailabilityId: number | null
  cancellingReservationId: number | null
  onReserve: (availability: AvailabilityResponse) => void
  onCancelReservation: (reservation: ReservationResponse) => void
  formatDateTime: (value: string) => string
  hasActiveReservationOverlap: (
    availability: AvailabilityResponse,
    reservations: ReservationResponse[],
  ) => boolean
}

export function UserHomeView({
  currentUser,
  onLogout,
  resources,
  resourceMessage,
  isLoadingResources,
  availabilities,
  availabilityMessage,
  isLoadingAvailabilities,
  reservations,
  reservationMessage,
  myReservationsMessage,
  isLoadingReservations,
  reservingAvailabilityId,
  cancellingReservationId,
  onReserve,
  onCancelReservation,
  formatDateTime,
  hasActiveReservationOverlap,
}: UserHomeViewProps) {
  return (
    <main className="app-shell">
      <section className="home-panel">
        <HomeHeader currentUser={currentUser} onLogout={onLogout} />

        <section className="placeholder-section" aria-labelledby="user-title">
          <h2 id="user-title">User home</h2>
          <p>Browse resources, reserve availability, and manage your reservations.</p>
        </section>

        <ResourcesSection
          currentUserRole="User"
          resources={resources}
          isLoadingResources={isLoadingResources}
          resourceMessage={resourceMessage}
          deletingResourceId={null}
          onEditResource={() => undefined}
          onDeleteResource={() => undefined}
        />

        <AvailabilitySection
          currentUserRole="User"
          availabilities={availabilities}
          reservations={reservations}
          isLoadingAvailabilities={isLoadingAvailabilities}
          availabilityMessage={availabilityMessage}
          reservationMessage={reservationMessage}
          reservingAvailabilityId={reservingAvailabilityId}
          deletingAvailabilityId={null}
          onReserve={onReserve}
          onEditAvailability={() => undefined}
          onDeleteAvailability={() => undefined}
          formatDateTime={formatDateTime}
          hasActiveReservationOverlap={hasActiveReservationOverlap}
        />

        <ReservationsSection
          title="My reservations"
          reservations={reservations}
          isLoading={isLoadingReservations}
          message={myReservationsMessage}
          cancellingReservationId={cancellingReservationId}
          onCancelReservation={onCancelReservation}
          formatDateTime={formatDateTime}
        />
      </section>
    </main>
  )
}
