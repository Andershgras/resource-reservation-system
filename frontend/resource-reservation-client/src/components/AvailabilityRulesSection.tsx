import type { AvailabilityRuleResponse } from '../api/types'

interface AvailabilityRulesSectionProps {
  availabilityRules: AvailabilityRuleResponse[]
  isLoadingAvailabilityRules: boolean
  availabilityRuleMessage: string
  deletingAvailabilityRuleId: number | null
  onEditAvailabilityRule: (rule: AvailabilityRuleResponse) => void
  onDeleteAvailabilityRule: (rule: AvailabilityRuleResponse) => void
}

export function AvailabilityRulesSection({
  availabilityRules,
  isLoadingAvailabilityRules,
  availabilityRuleMessage,
  deletingAvailabilityRuleId,
  onEditAvailabilityRule,
  onDeleteAvailabilityRule,
}: AvailabilityRulesSectionProps) {
  return (
    <section className="panel-section" aria-labelledby="availability-rules-title">
      <div className="section-heading">
        <h2 id="availability-rules-title">Weekly schedule</h2>
        <span className="count-badge">{availabilityRules.length}</span>
      </div>
      {isLoadingAvailabilityRules && (
        <p className="status-message" role="status">
          Loading weekly schedule...
        </p>
      )}
      {availabilityRuleMessage && (
        <p className="status-message">{availabilityRuleMessage}</p>
      )}
      {!isLoadingAvailabilityRules && availabilityRules.length === 0 && (
        <p className="status-message">No weekly schedule found.</p>
      )}
      {availabilityRules.length > 0 && (
        <ul className="resource-list">
          {availabilityRules.map((rule) => (
            <li key={rule.id} className="resource-item">
              <div className="item-main">
                <strong>{rule.resourceName}</strong>
                <div className="availability-dates">
                  <p>
                    <span>Day</span>
                    {rule.dayName}
                  </p>
                  <p>
                    <span>Time</span>
                    {formatClockTime(rule.startTime)} - {formatClockTime(rule.endTime)}
                  </p>
                </div>
              </div>
              <div className="resource-actions">
                <button type="button" onClick={() => onEditAvailabilityRule(rule)}>
                  Edit
                </button>
                <button
                  type="button"
                  disabled={deletingAvailabilityRuleId === rule.id}
                  onClick={() => onDeleteAvailabilityRule(rule)}
                >
                  {deletingAvailabilityRuleId === rule.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function formatClockTime(value: string) {
  return value.slice(0, 5)
}
