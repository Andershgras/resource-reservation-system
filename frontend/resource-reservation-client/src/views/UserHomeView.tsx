import { useState, type Dispatch, type SetStateAction } from 'react'
import type {
  AvailabilityResponse,
  BookableSlotResponse,
  ReservationResponse,
  ResourceScheduleResponse,
  ResourceResponse,
  UserResponse,
} from '../api/types'
import { AvailabilitySection } from '../components/AvailabilitySection'
import { HomeHeader } from '../components/HomeHeader'
import { ReservationsSection } from '../components/ReservationsSection'
import { ResourceBookingSection } from '../components/ResourceBookingSection'
import { RoleTabs } from '../components/RoleTabs'

type UserScreen = 'resources' | 'availability' | 'my-reservations'

const userTabs: { id: UserScreen; label: string }[] = [
  { id: 'resources', label: 'Book resource' },
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
  selectedScheduleResourceId: string
  scheduleFromDate: string
  setScheduleFromDate: Dispatch<SetStateAction<string>>
  scheduleToDate: string
  setScheduleToDate: Dispatch<SetStateAction<string>>
  resourceSchedule: ResourceScheduleResponse | null
  resourceScheduleMessage: string
  isLoadingResourceSchedule: boolean
  selectedScheduleSlotKey: string | null
  reservingScheduleSlotKey: string | null
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
  onSelectResourceForSchedule: (resource: ResourceResponse) => void
  onLoadResourceSchedule: () => void
  onSelectScheduleSlot: (slot: BookableSlotResponse) => void
  onCancelScheduleSlotSelection: () => void
  onReserveScheduleSlot: (slot: BookableSlotResponse) => void
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
  selectedScheduleResourceId,
  scheduleFromDate,
  setScheduleFromDate,
  scheduleToDate,
  setScheduleToDate,
  resourceSchedule,
  resourceScheduleMessage,
  isLoadingResourceSchedule,
  selectedScheduleSlotKey,
  reservingScheduleSlotKey,
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
  onSelectResourceForSchedule,
  onLoadResourceSchedule,
  onSelectScheduleSlot,
  onCancelScheduleSlotSelection,
  onReserveScheduleSlot,
  onSelectAvailabilityForReservation,
  onCancelReservationTimeSelection,
  onCancelReservation,
  formatDateTime,
  formatDateTimeInput,
}: UserHomeViewProps) {
  const [activeScreen, setActiveScreen] = useState<UserScreen>('resources')
  const activeReservationCount = reservations.filter(
    (reservation) => reservation.status === 'Active',
  ).length

  return (
    <main className="app-shell">
      <section className="home-panel">
        <HomeHeader currentUser={currentUser} onLogout={onLogout} />

        <section className="panel-section overview-panel" aria-labelledby="user-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">User overview</p>
              <h2 id="user-title">Your booking space</h2>
            </div>
          </div>
          <div className="summary-grid" aria-label="User summary">
            <div>
              <span>{resources.length}</span>
              <p>Resources</p>
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
          tabs={userTabs}
          activeTab={activeScreen}
          onTabChange={setActiveScreen}
        />

        {activeScreen === 'resources' && (
          <UserResourceBookingScreen
            resources={resources}
            resourceMessage={resourceMessage}
            isLoadingResources={isLoadingResources}
            selectedScheduleResourceId={selectedScheduleResourceId}
            scheduleFromDate={scheduleFromDate}
            setScheduleFromDate={setScheduleFromDate}
            scheduleToDate={scheduleToDate}
            setScheduleToDate={setScheduleToDate}
            resourceSchedule={resourceSchedule}
            resourceScheduleMessage={resourceScheduleMessage}
            reservationMessage={reservationMessage}
            reservationValidationMessage={reservationValidationMessage}
            isLoadingResourceSchedule={isLoadingResourceSchedule}
            selectedScheduleSlotKey={selectedScheduleSlotKey}
            reservingScheduleSlotKey={reservingScheduleSlotKey}
            reservationStartTime={reservationStartTime}
            setReservationStartTime={setReservationStartTime}
            reservationEndTime={reservationEndTime}
            setReservationEndTime={setReservationEndTime}
            onSelectResourceForSchedule={onSelectResourceForSchedule}
            onLoadResourceSchedule={onLoadResourceSchedule}
            onSelectScheduleSlot={onSelectScheduleSlot}
            onCancelScheduleSlotSelection={onCancelScheduleSlotSelection}
            onReserveScheduleSlot={onReserveScheduleSlot}
            formatDateTime={formatDateTime}
            formatDateTimeInput={formatDateTimeInput}
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

interface UserResourceBookingScreenProps {
  resources: ResourceResponse[]
  resourceMessage: string
  isLoadingResources: boolean
  selectedScheduleResourceId: string
  scheduleFromDate: string
  setScheduleFromDate: Dispatch<SetStateAction<string>>
  scheduleToDate: string
  setScheduleToDate: Dispatch<SetStateAction<string>>
  resourceSchedule: ResourceScheduleResponse | null
  resourceScheduleMessage: string
  reservationMessage: string
  reservationValidationMessage: string
  isLoadingResourceSchedule: boolean
  selectedScheduleSlotKey: string | null
  reservingScheduleSlotKey: string | null
  reservationStartTime: string
  setReservationStartTime: Dispatch<SetStateAction<string>>
  reservationEndTime: string
  setReservationEndTime: Dispatch<SetStateAction<string>>
  onSelectResourceForSchedule: (resource: ResourceResponse) => void
  onLoadResourceSchedule: () => void
  onSelectScheduleSlot: (slot: BookableSlotResponse) => void
  onCancelScheduleSlotSelection: () => void
  onReserveScheduleSlot: (slot: BookableSlotResponse) => void
  formatDateTime: (value: string) => string
  formatDateTimeInput: (value: string) => string
}

function UserResourceBookingScreen({
  resources,
  resourceMessage,
  isLoadingResources,
  selectedScheduleResourceId,
  scheduleFromDate,
  setScheduleFromDate,
  scheduleToDate,
  setScheduleToDate,
  resourceSchedule,
  resourceScheduleMessage,
  reservationMessage,
  reservationValidationMessage,
  isLoadingResourceSchedule,
  selectedScheduleSlotKey,
  reservingScheduleSlotKey,
  reservationStartTime,
  setReservationStartTime,
  reservationEndTime,
  setReservationEndTime,
  onSelectResourceForSchedule,
  onLoadResourceSchedule,
  onSelectScheduleSlot,
  onCancelScheduleSlotSelection,
  onReserveScheduleSlot,
  formatDateTime,
  formatDateTimeInput,
}: UserResourceBookingScreenProps) {
  return (
    <ResourceBookingSection
      resources={resources}
      resourceMessage={resourceMessage}
      isLoadingResources={isLoadingResources}
      selectedScheduleResourceId={selectedScheduleResourceId}
      scheduleFromDate={scheduleFromDate}
      setScheduleFromDate={setScheduleFromDate}
      scheduleToDate={scheduleToDate}
      setScheduleToDate={setScheduleToDate}
      resourceSchedule={resourceSchedule}
      resourceScheduleMessage={resourceScheduleMessage}
      reservationMessage={reservationMessage}
      reservationValidationMessage={reservationValidationMessage}
      isLoadingResourceSchedule={isLoadingResourceSchedule}
      selectedScheduleSlotKey={selectedScheduleSlotKey}
      reservingScheduleSlotKey={reservingScheduleSlotKey}
      reservationStartTime={reservationStartTime}
      setReservationStartTime={setReservationStartTime}
      reservationEndTime={reservationEndTime}
      setReservationEndTime={setReservationEndTime}
      onSelectResourceForSchedule={onSelectResourceForSchedule}
      onLoadResourceSchedule={onLoadResourceSchedule}
      onSelectScheduleSlot={onSelectScheduleSlot}
      onCancelScheduleSlotSelection={onCancelScheduleSlotSelection}
      onReserveScheduleSlot={onReserveScheduleSlot}
      formatDateTime={formatDateTime}
      formatDateTimeInput={formatDateTimeInput}
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
