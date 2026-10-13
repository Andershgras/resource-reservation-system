import type { ReservationResponse } from '../../api/types'
import { formatDateTimeRange } from '../../lib/dates'
import { getErrorMessage } from '../../lib/errors'
import { Alert } from '../../ui/Alert'
import { ButtonLink } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { LoadingState } from '../../ui/States'
import '../../components/lists.css'

interface MoveBookingCardProps {
  reservation: ReservationResponse | undefined
  isLoading: boolean
  error: unknown
  // Why the booking can't be moved, or null when it can.
  problem: string | null
}

// Shown instead of the resource list while a booking is being moved. A
// booking stays on its resource, so there is nothing else to choose.
export function MoveBookingCard({ reservation, isLoading, error, problem }: MoveBookingCardProps) {
  return (
    <Card title="Move a booking" description="Choose a new time in the calendar.">
      {isLoading && <LoadingState>Loading the booking...</LoadingState>}
      {error ? <Alert tone="danger">{getErrorMessage(error)}</Alert> : null}
      {reservation && (
        <dl className="item-meta move-booking-details">
          <div>
            <dt>Resource</dt>
            <dd>{reservation.resourceName}</dd>
          </div>
          <div>
            <dt>Current time</dt>
            <dd>{formatDateTimeRange(reservation.startTime, reservation.endTime)}</dd>
          </div>
        </dl>
      )}
      {problem && <Alert tone="info">{problem}</Alert>}
      <ButtonLink to="/my-reservations" size="sm">
        Back to my reservations
      </ButtonLink>
    </Card>
  )
}
