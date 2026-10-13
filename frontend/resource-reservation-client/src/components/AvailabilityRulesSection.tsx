import type { AvailabilityRuleResponse } from '../api/types'
import { formatTimeRange } from '../lib/dates'
import { Alert, type Notice } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState, LoadingState } from '../ui/States'
import './lists.css'

interface AvailabilityRulesSectionProps {
  availabilityRules: AvailabilityRuleResponse[]
  isLoadingAvailabilityRules: boolean
  notice: Notice | null
  deletingAvailabilityRuleId: number | null
  onEditAvailabilityRule: (rule: AvailabilityRuleResponse) => void
  onDeleteAvailabilityRule: (rule: AvailabilityRuleResponse) => void
}

export function AvailabilityRulesSection({
  availabilityRules,
  isLoadingAvailabilityRules,
  notice,
  deletingAvailabilityRuleId,
  onEditAvailabilityRule,
  onDeleteAvailabilityRule,
}: AvailabilityRulesSectionProps) {
  return (
    <Card
      title="Weekly schedule"
      actions={<Badge label={`${availabilityRules.length} rules`}>{availabilityRules.length}</Badge>}
    >
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {isLoadingAvailabilityRules && <LoadingState>Loading weekly schedule...</LoadingState>}
      {!isLoadingAvailabilityRules && availabilityRules.length === 0 && (
        <EmptyState
          title="No weekly schedule found."
          description="Weekly rules set the regular opening hours of each resource."
        />
      )}
      {availabilityRules.length > 0 && (
        <ul className="item-list">
          {availabilityRules.map((rule) => {
            const hours = formatTimeRange(rule.startTime, rule.endTime)

            return (
              <li key={rule.id} className="item">
                <div className="item-main">
                  <p className="item-title">
                    <strong>{rule.resourceName}</strong>
                  </p>
                  <dl className="item-meta">
                    <div>
                      <dt className="visually-hidden">Day</dt>
                      <dd>{rule.dayName}</dd>
                    </div>
                    <div>
                      <dt className="visually-hidden">Hours</dt>
                      <dd>{hours}</dd>
                    </div>
                  </dl>
                </div>
                <div className="item-actions">
                  <Button
                    size="sm"
                    aria-label={`Edit ${rule.resourceName}, ${rule.dayName} ${hours}`}
                    onClick={() => onEditAvailabilityRule(rule)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${rule.resourceName}, ${rule.dayName} ${hours}`}
                    disabled={deletingAvailabilityRuleId === rule.id}
                    onClick={() => onDeleteAvailabilityRule(rule)}
                  >
                    {deletingAvailabilityRuleId === rule.id ? 'Deleting...' : 'Delete'}
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
