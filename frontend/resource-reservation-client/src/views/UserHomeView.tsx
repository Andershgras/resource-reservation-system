import { useState, type Dispatch, type SetStateAction } from 'react'
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
import { RoleTabs } from '../components/RoleTabs'

type UserScreen = 'resources' | 'availability' | 'my-reservations'

const userTabs: { id: UserScreen; label: string }[] = [
  { id: 'resources', label: 'Resources' },
  { id: 'availability', label: 'Availability' },
  { id: 'my-reservations', label: 'My reservations' },
]

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
  reservationValidationMessage: string
  myReservationsMessage: string
  isLoadingReservations: boolean
  reservingAvailabilityId: number | null
  selectedReservationAvailabilityId: number | null
  reservationStartTime: string
  setReservationStartTime: Dispatch<SetStateAction<string>>
  reservationEndTime: string
  setReservationEndTime: Dispatch<SetStateAction<string>>
  cancellingReservationId: number | null
  onReserve: (availability: AvailabilityResponse) => void
  onSelectAvailabilityForReservation: (
    availability: AvailabilityResponse,
  ) => void
  onCancelReservationTimeSelection: () => void
  onCancelReservation: (reservation: ReservationResponse) => void
  formatDateTime: (value: string) => string
  formatDateTimeInput: (value: string) => string
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
  reservationValidationMessage,
  myReservationsMessage,
  isLoadingReservations,
  reservingAvailabilityId,
  selectedReservationAvailabilityId,
  reservationStartTime,
  setReservationStartTime,
  reservationEndTime,
  setReservationEndTime,
  cancellingReservationId,
  onReserve,
  onSelectAvailabilityForReservation,
  onCancelReservationTimeSelection,
  onCancelReservation,
  formatDateTime,
  formatDateTimeInput,
}: UserHomeViewProps) {
  const [activeScreen, setActiveScreen] = useState<UserScreen>('resources')

  return (
    <main className="app-shell">
      <section className="home-panel">
        <HomeHeader currentUser={currentUser} onLogout={onLogout} />

        <section className="placeholder-section" aria-labelledby="user-title">
          <h2 id="user-title">User home</h2>
          <p>Browse resources, reserve availability, and manage your reservations.</p>
        </section>

        <RoleTabs
          tabs={userTabs}
          activeTab={activeScreen}
          onTabChange={setActiveScreen}
        />

        {activeScreen === 'resources' && (
          <UserResourcesScreen
            resources={resources}
            resourceMessage={resourceMessage}
            isLoadingResources={isLoadingResources}
          />
        )}

        {activeScreen === 'availability' && (
          <UserAvailabilityScreen
            availabilities={availabilities}
            availabilityMessage={availabilityMessage}
            isLoadingAvailabilities={isLoadingAvailabilities}
            reservationMessage={reservationMessage}
            reservationValidationMessage={reservationValidationMessage}
            reservingAvailabilityId={reservingAvailabilityId}
            selectedReservationAvailabilityId={selectedReservationAvailabilityId}
            reservationStartTime={reservationStartTime}
            setReservationStartTime={setReservationStartTime}
            reservationEndTime={reservationEndTime}
            setReservationEndTime={setReservationEndTime}
            onReserve={onReserve}
            onSelectAvailabilityForReservation={
              onSelectAvailabilityForReservation
            }
            onCancelReservationTimeSelection={onCancelReservationTimeSelection}
            formatDateTime={formatDateTime}
            formatDateTimeInput={formatDateTimeInput}
          />
        )}

        {activeScreen === 'my-reservations' && (
          <UserReservationsScreen
            reservations={reservations}
            myReservationsMessage={myReservationsMessage}
            isLoadingReservations={isLoadingReservations}
            cancellingReservationId={cancellingReservationId}
            onCancelReservation={onCancelReservation}
            formatDateTime={formatDateTime}
          />
        )}
      </section>
    </main>
  )
}

interface UserResourcesScreenProps {
  resources: ResourceResponse[]
  resourceMessage: string
  isLoadingResources: boolean
}

function UserResourcesScreen({
  resources,
  resourceMessage,
  isLoadingResources,
}: UserResourcesScreenProps) {
  return (
    <ResourcesSection
      currentUserRole="User"
      resources={resources}
      isLoadingResources={isLoadingResources}
      resourceMessage={resourceMessage}
      deletingResourceId={null}
      onEditResource={() => undefined}
      onDeleteResource={() => undefined}
    />
  )
}

interface UserAvailabilityScreenProps {
  availabilities: AvailabilityResponse[]
  availabilityMessage: string
  isLoadingAvailabilities: boolean
  reservationMessage: string
  reservationValidationMessage: string
  reservingAvailabilityId: number | null
  selectedReservationAvailabilityId: number | null
  reservationStartTime: string
  setReservationStartTime: Dispatch<SetStateAction<string>>
  reservationEndTime: string
  setReservationEndTime: Dispatch<SetStateAction<string>>
  onReserve: (availability: AvailabilityResponse) => void
  onSelectAvailabilityForReservation: (
    availability: AvailabilityResponse,
  ) => void
  onCancelReservationTimeSelection: () => void
  formatDateTime: (value: string) => string
  formatDateTimeInput: (value: string) => string
}

function UserAvailabilityScreen({
  availabilities,
  availabilityMessage,
  isLoadingAvailabilities,
  reservationMessage,
  reservationValidationMessage,
  reservingAvailabilityId,
  selectedReservationAvailabilityId,
  reservationStartTime,
  setReservationStartTime,
  reservationEndTime,
  setReservationEndTime,
  onReserve,
  onSelectAvailabilityForReservation,
  onCancelReservationTimeSelection,
  formatDateTime,
  formatDateTimeInput,
}: UserAvailabilityScreenProps) {
  return (
    <AvailabilitySection
      currentUserRole="User"
      availabilities={availabilities}
      isLoadingAvailabilities={isLoadingAvailabilities}
      availabilityMessage={availabilityMessage}
      reservationMessage={reservationMessage}
      reservationValidationMessage={reservationValidationMessage}
      reservingAvailabilityId={reservingAvailabilityId}
      selectedReservationAvailabilityId={selectedReservationAvailabilityId}
      reservationStartTime={reservationStartTime}
      setReservationStartTime={setReservationStartTime}
      reservationEndTime={reservationEndTime}
      setReservationEndTime={setReservationEndTime}
      deletingAvailabilityId={null}
      onReserve={onReserve}
      onSelectAvailabilityForReservation={onSelectAvailabilityForReservation}
      onCancelReservationTimeSelection={onCancelReservationTimeSelection}
      onEditAvailability={() => undefined}
      onDeleteAvailability={() => undefined}
      formatDateTime={formatDateTime}
      formatDateTimeInput={formatDateTimeInput}
    />
  )
}

interface UserReservationsScreenProps {
  reservations: ReservationResponse[]
  myReservationsMessage: string
  isLoadingReservations: boolean
  cancellingReservationId: number | null
  onCancelReservation: (reservation: ReservationResponse) => void
  formatDateTime: (value: string) => string
}

function UserReservationsScreen({
  reservations,
  myReservationsMessage,
  isLoadingReservations,
  cancellingReservationId,
  onCancelReservation,
  formatDateTime,
}: UserReservationsScreenProps) {
  return (
    <ReservationsSection
      title="My reservations"
      reservations={reservations}
      isLoading={isLoadingReservations}
      message={myReservationsMessage}
      cancellingReservationId={cancellingReservationId}
      onCancelReservation={onCancelReservation}
      formatDateTime={formatDateTime}
    />
  )
}
