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
import { RoleTabs } from '../components/RoleTabs'

type AdminScreen = 'resources' | 'availability' | 'reservations'

const adminTabs: { id: AdminScreen; label: string }[] = [
  { id: 'resources', label: 'Resources' },
  { id: 'availability', label: 'Availability' },
  { id: 'reservations', label: 'Reservations' },
]

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
}: AdminHomeViewProps) {
  const [activeScreen, setActiveScreen] = useState<AdminScreen>('resources')
  const [reservationResourceFilter, setReservationResourceFilter] = useState('')
  const [reservationStatusFilter, setReservationStatusFilter] = useState<
    '' | ReservationStatus
  >('')
  const activeResourceCount = resources.filter((resource) => resource.isActive).length
  const activeReservationCount = adminReservations.filter(
    (reservation) => reservation.status === 'Active',
  ).length
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
  const sortedAvailabilities = useMemo(
    () =>
      [...availabilities].sort((firstAvailability, secondAvailability) => {
        const resourceComparison = firstAvailability.resourceName.localeCompare(
          secondAvailability.resourceName,
        )

        if (resourceComparison !== 0) {
          return resourceComparison
        }

        return (
          new Date(firstAvailability.startTime).getTime() -
          new Date(secondAvailability.startTime).getTime()
        )
      }),
    [availabilities],
  )

  return (
    <main className="app-shell">
      <section className="home-panel">
        <HomeHeader currentUser={currentUser} onLogout={onLogout} />

        <section className="panel-section overview-panel" aria-labelledby="admin-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Admin overview</p>
              <h2 id="admin-title">Booking operations</h2>
            </div>
          </div>
          <div className="summary-grid" aria-label="Admin summary">
            <div>
              <span>{activeResourceCount}</span>
              <p>Active resources</p>
            </div>
            <div>
              <span>{availabilities.length}</span>
              <p>Availability windows</p>
            </div>
            <div>
              <span>{activeReservationCount}</span>
              <p>Active reservations</p>
            </div>
          </div>
        </section>

        <RoleTabs
          tabs={adminTabs}
          activeTab={activeScreen}
          onTabChange={setActiveScreen}
        />

        {activeScreen === 'resources' && (
          <AdminResourcesScreen
            resources={resources}
            resourceMessage={resourceMessage}
            isLoadingResources={isLoadingResources}
            resourceName={resourceName}
            setResourceName={setResourceName}
            resourceDescription={resourceDescription}
            setResourceDescription={setResourceDescription}
            resourceLocation={resourceLocation}
            setResourceLocation={setResourceLocation}
            resourceIsActive={resourceIsActive}
            setResourceIsActive={setResourceIsActive}
            editingResourceId={editingResourceId}
            isSavingResource={isSavingResource}
            deletingResourceId={deletingResourceId}
            onSaveResource={onSaveResource}
            onEditResource={onEditResource}
            onDeleteResource={onDeleteResource}
            onCancelResourceEdit={onCancelResourceEdit}
          />
        )}

        {activeScreen === 'availability' && (
          <AdminAvailabilityScreen
            resources={resources}
            availabilities={sortedAvailabilities}
            availabilityMessage={availabilityMessage}
            isLoadingAvailabilities={isLoadingAvailabilities}
            availabilityResourceId={availabilityResourceId}
            setAvailabilityResourceId={setAvailabilityResourceId}
            availabilityStartTime={availabilityStartTime}
            setAvailabilityStartTime={setAvailabilityStartTime}
            availabilityEndTime={availabilityEndTime}
            setAvailabilityEndTime={setAvailabilityEndTime}
            availabilityValidationMessage={availabilityValidationMessage}
            editingAvailabilityId={editingAvailabilityId}
            isSavingAvailability={isSavingAvailability}
            deletingAvailabilityId={deletingAvailabilityId}
            onSaveAvailability={onSaveAvailability}
            onEditAvailability={onEditAvailability}
            onDeleteAvailability={onDeleteAvailability}
            onCancelAvailabilityEdit={onCancelAvailabilityEdit}
            formatDateTime={formatDateTime}
          />
        )}

        {activeScreen === 'reservations' && (
          <AdminReservationsScreen
            resources={resources}
            reservations={filteredAdminReservations}
            message={adminReservationsMessage}
            isLoading={isLoadingAdminReservations}
            selectedResourceId={reservationResourceFilter}
            selectedStatus={reservationStatusFilter}
            hasReservationFilters={hasReservationFilters}
            cancellingReservationId={adminCancellingReservationId}
            onSelectedResourceIdChange={setReservationResourceFilter}
            onSelectedStatusChange={setReservationStatusFilter}
            onClearFilters={() => {
              setReservationResourceFilter('')
              setReservationStatusFilter('')
            }}
            onCancelReservation={onAdminCancelReservation}
            formatDateTime={formatDateTime}
          />
        )}
      </section>
    </main>
  )
}

interface AdminResourcesScreenProps {
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
}

function AdminResourcesScreen({
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
}: AdminResourcesScreenProps) {
  return (
    <>
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

      <ResourcesSection
        currentUserRole="Admin"
        resources={resources}
        isLoadingResources={isLoadingResources}
        resourceMessage={resourceMessage}
        deletingResourceId={deletingResourceId}
        onEditResource={onEditResource}
        onDeleteResource={onDeleteResource}
      />
    </>
  )
}

interface AdminAvailabilityScreenProps {
  resources: ResourceResponse[]
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
  formatDateTime: (value: string) => string
}

function AdminAvailabilityScreen({
  resources,
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
  formatDateTime,
}: AdminAvailabilityScreenProps) {
  return (
    <>
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

      <AvailabilitySection
        currentUserRole="Admin"
        availabilities={availabilities}
        isLoadingAvailabilities={isLoadingAvailabilities}
        availabilityMessage={availabilityMessage}
        reservationMessage=""
        reservingAvailabilityId={null}
        deletingAvailabilityId={deletingAvailabilityId}
        onReserve={() => undefined}
        onEditAvailability={onEditAvailability}
        onDeleteAvailability={onDeleteAvailability}
        formatDateTime={formatDateTime}
      />
    </>
  )
}

interface AdminReservationsScreenProps {
  resources: ResourceResponse[]
  reservations: ReservationResponse[]
  message: string
  isLoading: boolean
  selectedResourceId: string
  selectedStatus: '' | ReservationStatus
  hasReservationFilters: boolean
  cancellingReservationId: number | null
  onSelectedResourceIdChange: (resourceId: string) => void
  onSelectedStatusChange: (status: '' | ReservationStatus) => void
  onClearFilters: () => void
  onCancelReservation: (reservation: ReservationResponse) => void
  formatDateTime: (value: string) => string
}

function AdminReservationsScreen({
  resources,
  reservations,
  message,
  isLoading,
  selectedResourceId,
  selectedStatus,
  hasReservationFilters,
  cancellingReservationId,
  onSelectedResourceIdChange,
  onSelectedStatusChange,
  onClearFilters,
  onCancelReservation,
  formatDateTime,
}: AdminReservationsScreenProps) {
  return (
    <ReservationsSection
      title="Reservations"
      reservations={reservations}
      isLoading={isLoading}
      message={message}
      showUserId
      filterResources={resources}
      selectedResourceId={selectedResourceId}
      selectedStatus={selectedStatus}
      onSelectedResourceIdChange={onSelectedResourceIdChange}
      onSelectedStatusChange={onSelectedStatusChange}
      onClearFilters={onClearFilters}
      emptyMessage={
        hasReservationFilters
          ? 'No reservations match the selected filters.'
          : 'No reservations found.'
      }
      cancellingReservationId={cancellingReservationId}
      onCancelReservation={onCancelReservation}
      formatDateTime={formatDateTime}
    />
  )
}
