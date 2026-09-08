import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  AvailabilityResponse,
  ReservationResponse,
  ReservationStatus,
  ResourceResponse,
  UserResponse,
} from '../api/types'
import { AvailabilityFormSection } from '../components/AvailabilityFormSection'
import { AvailabilitySection } from '../components/AvailabilitySection'
import { HomeHeader } from '../components/HomeHeader'
import { ReservationsSection } from '../components/ReservationsSection'
import { ResourceFormSection } from '../components/ResourceFormSection'
import { ResourcesSection } from '../components/ResourcesSection'

interface AdminHomeViewProps {
  currentUser: UserResponse
  onLogout: () => void
  resources: ResourceResponse[]
  resourceMessage: string
  isLoadingResources: boolean
  resourceName: string
  setResourceName: Dispatch<SetStateAction<string>>
  resourceDescription: string
  setResourceDescription: Dispatch<SetStateAction<string>>
  resourceLocation: string
  setResourceLocation: Dispatch<SetStateAction<string>>
  resourceIsActive: boolean
  setResourceIsActive: Dispatch<SetStateAction<boolean>>
  editingResourceId: number | null
  isSavingResource: boolean
  deletingResourceId: number | null
  onSaveResource: (event: FormEvent<HTMLFormElement>) => void
  onEditResource: (resource: ResourceResponse) => void
  onDeleteResource: (resource: ResourceResponse) => void
  onCancelResourceEdit: () => void
  availabilities: AvailabilityResponse[]
  availabilityMessage: string
  isLoadingAvailabilities: boolean
  availabilityResourceId: string
  setAvailabilityResourceId: Dispatch<SetStateAction<string>>
  availabilityStartTime: string
  setAvailabilityStartTime: Dispatch<SetStateAction<string>>
  availabilityEndTime: string
  setAvailabilityEndTime: Dispatch<SetStateAction<string>>
  availabilityValidationMessage: string
  editingAvailabilityId: number | null
  isSavingAvailability: boolean
  deletingAvailabilityId: number | null
  onSaveAvailability: (event: FormEvent<HTMLFormElement>) => void
  onEditAvailability: (availability: AvailabilityResponse) => void
  onDeleteAvailability: (availability: AvailabilityResponse) => void
  onCancelAvailabilityEdit: () => void
  adminReservations: ReservationResponse[]
  adminReservationsMessage: string
  isLoadingAdminReservations: boolean
  adminCancellingReservationId: number | null
  onAdminCancelReservation: (reservation: ReservationResponse) => void
  formatDateTime: (value: string) => string
  hasActiveReservationOverlap: (
    availability: AvailabilityResponse,
    reservations: ReservationResponse[],
  ) => boolean
}

export function AdminHomeView({
  currentUser,
  onLogout,
  resources,
  resourceMessage,
  isLoadingResources,
  resourceName,
  setResourceName,
  resourceDescription,
  setResourceDescription,
  resourceLocation,
  setResourceLocation,
  resourceIsActive,
  setResourceIsActive,
  editingResourceId,
  isSavingResource,
  deletingResourceId,
  onSaveResource,
  onEditResource,
  onDeleteResource,
  onCancelResourceEdit,
  availabilities,
  availabilityMessage,
  isLoadingAvailabilities,
  availabilityResourceId,
  setAvailabilityResourceId,
  availabilityStartTime,
  setAvailabilityStartTime,
  availabilityEndTime,
  setAvailabilityEndTime,
  availabilityValidationMessage,
  editingAvailabilityId,
  isSavingAvailability,
  deletingAvailabilityId,
  onSaveAvailability,
  onEditAvailability,
  onDeleteAvailability,
  onCancelAvailabilityEdit,
  adminReservations,
  adminReservationsMessage,
  isLoadingAdminReservations,
  adminCancellingReservationId,
  onAdminCancelReservation,
  formatDateTime,
  hasActiveReservationOverlap,
}: AdminHomeViewProps) {
  const [reservationResourceFilter, setReservationResourceFilter] = useState('')
  const [reservationStatusFilter, setReservationStatusFilter] = useState<
    '' | ReservationStatus
  >('')
  const hasReservationFilters =
    reservationResourceFilter !== '' || reservationStatusFilter !== ''
  const filteredAdminReservations = useMemo(
    () =>
      adminReservations.filter((reservation) => {
        const matchesResource =
          reservationResourceFilter === '' ||
          reservation.resourceId === Number(reservationResourceFilter)
        const matchesStatus =
          reservationStatusFilter === '' ||
          reservation.status === reservationStatusFilter

        return matchesResource && matchesStatus
      }),
    [adminReservations, reservationResourceFilter, reservationStatusFilter],
  )

  return (
    <main className="app-shell">
      <section className="home-panel">
        <HomeHeader currentUser={currentUser} onLogout={onLogout} />

        <section className="placeholder-section" aria-labelledby="admin-title">
          <h2 id="admin-title">Admin home</h2>
          <p>Manage resources, availability, and reservations.</p>
        </section>

        <ResourceFormSection
          editingResourceId={editingResourceId}
          resourceName={resourceName}
          setResourceName={setResourceName}
          resourceDescription={resourceDescription}
          setResourceDescription={setResourceDescription}
          resourceLocation={resourceLocation}
          setResourceLocation={setResourceLocation}
          resourceIsActive={resourceIsActive}
          setResourceIsActive={setResourceIsActive}
          isSavingResource={isSavingResource}
          onSubmit={onSaveResource}
          onCancelEdit={onCancelResourceEdit}
        />

        <AvailabilityFormSection
          editingAvailabilityId={editingAvailabilityId}
          resources={resources}
          availabilityResourceId={availabilityResourceId}
          setAvailabilityResourceId={setAvailabilityResourceId}
          availabilityStartTime={availabilityStartTime}
          setAvailabilityStartTime={setAvailabilityStartTime}
          availabilityEndTime={availabilityEndTime}
          setAvailabilityEndTime={setAvailabilityEndTime}
          validationMessage={availabilityValidationMessage}
          isSavingAvailability={isSavingAvailability}
          onSubmit={onSaveAvailability}
          onCancelEdit={onCancelAvailabilityEdit}
        />

        <ResourcesSection
          currentUserRole="Admin"
          resources={resources}
          isLoadingResources={isLoadingResources}
          resourceMessage={resourceMessage}
          deletingResourceId={deletingResourceId}
          onEditResource={onEditResource}
          onDeleteResource={onDeleteResource}
        />

        <AvailabilitySection
          currentUserRole="Admin"
          availabilities={availabilities}
          reservations={[]}
          isLoadingAvailabilities={isLoadingAvailabilities}
          availabilityMessage={availabilityMessage}
          reservationMessage=""
          reservingAvailabilityId={null}
          deletingAvailabilityId={deletingAvailabilityId}
          onReserve={() => undefined}
          onEditAvailability={onEditAvailability}
          onDeleteAvailability={onDeleteAvailability}
          formatDateTime={formatDateTime}
          hasActiveReservationOverlap={hasActiveReservationOverlap}
        />

        <ReservationsSection
          title="Reservations"
          reservations={filteredAdminReservations}
          isLoading={isLoadingAdminReservations}
          message={adminReservationsMessage}
          showUserId
          filterResources={resources}
          selectedResourceId={reservationResourceFilter}
          selectedStatus={reservationStatusFilter}
          onSelectedResourceIdChange={setReservationResourceFilter}
          onSelectedStatusChange={setReservationStatusFilter}
          onClearFilters={() => {
            setReservationResourceFilter('')
            setReservationStatusFilter('')
          }}
          emptyMessage={
            hasReservationFilters
              ? 'No reservations match the selected filters.'
              : 'No reservations found.'
          }
          cancellingReservationId={adminCancellingReservationId}
          onCancelReservation={onAdminCancelReservation}
          formatDateTime={formatDateTime}
        />
      </section>
    </main>
  )
}
