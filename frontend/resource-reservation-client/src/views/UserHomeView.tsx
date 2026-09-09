import { useState, type Dispatch, type SetStateAction } from 'react'
import type {
  BookableSlotResponse,
  ReservationResponse,
  ResourceScheduleResponse,
  ResourceResponse,
  UserResponse,
} from '../api/types'
import { HomeHeader } from '../components/HomeHeader'
import { ReservationsSection } from '../components/ReservationsSection'
import { ResourceBookingSection } from '../components/ResourceBookingSection'
import { RoleTabs } from '../components/RoleTabs'

type UserScreen = 'resources' | 'my-reservations'

const userTabs: { id: UserScreen; label: string }[] = [
  { id: 'resources', label: 'Book resource' },
  { id: 'my-reservations', label: 'My reservations' },
]

interface UserHomeViewProps {
  currentUser: UserResponse
  onLogout: () => void
  resources: ResourceResponse[]
  resourceMessage: string
  isLoadingResources: boolean
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
  reservationStartTime: string
  setReservationStartTime: Dispatch<SetStateAction<string>>
  reservationEndTime: string
  setReservationEndTime: Dispatch<SetStateAction<string>>
  cancellingReservationId: number | null
  onSelectResourceForSchedule: (resource: ResourceResponse) => void
  onLoadResourceSchedule: () => void
  onSelectScheduleSlot: (slot: BookableSlotResponse) => void
  onCancelScheduleSlotSelection: () => void
  onReserveScheduleSlot: (slot: BookableSlotResponse) => void
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
  reservationStartTime,
  setReservationStartTime,
  reservationEndTime,
  setReservationEndTime,
  cancellingReservationId,
  onSelectResourceForSchedule,
  onLoadResourceSchedule,
  onSelectScheduleSlot,
  onCancelScheduleSlotSelection,
  onReserveScheduleSlot,
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
              <span>{resourceSchedule?.bookableSlots.length ?? 0}</span>
              <p>Bookable slots</p>
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
