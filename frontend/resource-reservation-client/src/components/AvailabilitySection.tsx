import type { AvailabilityResponse } from '../api/types'
import { formatDateTimeRange } from '../lib/dates'
import { Alert, type Notice } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState, LoadingState } from '../ui/States'
import './lists.css'

interface AvailabilitySectionProps {
  availabilities: AvailabilityResponse[]
  isLoadingAvailabilities: boolean
  notice: Notice | null
  deletingAvailabilityId: number | null
  onEditAvailability: (availability: AvailabilityResponse) => void
  onDeleteAvailability: (availability: AvailabilityResponse) => void
}

// One-off availability windows, for admins.
export function AvailabilitySection({
  availabilities,
  isLoadingAvailabilities,
  notice,
  deletingAvailabilityId,
  onEditAvailability,
  onDeleteAvailability,
}: AvailabilitySectionProps) {
  return (
    <Card
      title="Availability"
      actions={<Badge label={`${availabilities.length} windows`}>{availabilities.length}</Badge>}
    >
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {isLoadingAvailabilities && <LoadingState>Loading availability...</LoadingState>}
      {!isLoadingAvailabilities && availabilities.length === 0 && (
        <EmptyState
          title="No availability found."
          description="One-off windows add bookable time outside the weekly schedule."
        />
      )}
      {availabilities.length > 0 && (
        <ul className="item-list">
          {availabilities.map((availability) => {
            const period = formatDateTimeRange(availability.startTime, availability.endTime)

            return (
              <li key={availability.id} className="item">
                <div className="item-main">
                  <p className="item-title">
                    <strong>{availability.resourceName}</strong>
                  </p>
                  <p className="item-meta">{period}</p>
                </div>
                <div className="item-actions">
                  <Button
                    size="sm"
                    aria-label={`Edit ${availability.resourceName}, ${period}`}
                    onClick={() => onEditAvailability(availability)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${availability.resourceName}, ${period}`}
                    disabled={deletingAvailabilityId === availability.id}
                    onClick={() => onDeleteAvailability(availability)}
                  >
                    {deletingAvailabilityId === availability.id ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
