import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { ResourceResponse } from '../api/types'

const dayOptions = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
]

interface AvailabilityRuleFormSectionProps {
  editingAvailabilityRuleId: number | null
  resources: ResourceResponse[]
  availabilityRuleResourceId: string
  setAvailabilityRuleResourceId: Dispatch<SetStateAction<string>>
  availabilityRuleDayOfWeek: string
  setAvailabilityRuleDayOfWeek: Dispatch<SetStateAction<string>>
  availabilityRuleStartTime: string
  setAvailabilityRuleStartTime: Dispatch<SetStateAction<string>>
  availabilityRuleEndTime: string
  setAvailabilityRuleEndTime: Dispatch<SetStateAction<string>>
  validationMessage: string
  isSavingAvailabilityRule: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancelEdit: () => void
}

export function AvailabilityRuleFormSection({
  editingAvailabilityRuleId,
  resources,
  availabilityRuleResourceId,
  setAvailabilityRuleResourceId,
  availabilityRuleDayOfWeek,
  setAvailabilityRuleDayOfWeek,
  availabilityRuleStartTime,
  setAvailabilityRuleStartTime,
  availabilityRuleEndTime,
  setAvailabilityRuleEndTime,
  validationMessage,
  isSavingAvailabilityRule,
  onSubmit,
  onCancelEdit,
}: AvailabilityRuleFormSectionProps) {
  return (
    <section className="panel-section" aria-labelledby="availability-rule-form-title">
      <h2 id="availability-rule-form-title">
        {editingAvailabilityRuleId ? 'Edit weekly schedule' : 'Create weekly schedule'}
      </h2>
      <form className="resource-form" onSubmit={onSubmit} noValidate>
        <label>
          Resource
          <select
            value={availabilityRuleResourceId}
            onChange={(event) => setAvailabilityRuleResourceId(event.target.value)}
            required
          >
            <option value="">Select resource</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Weekday
          <select
            value={availabilityRuleDayOfWeek}
            onChange={(event) => setAvailabilityRuleDayOfWeek(event.target.value)}
            required
          >
            <option value="">Select weekday</option>
            {dayOptions.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Start time
          <input
            type="time"
            value={availabilityRuleStartTime}
            onChange={(event) => setAvailabilityRuleStartTime(event.target.value)}
            required
          />
        </label>

        <label>
          End time
          <input
            type="time"
            value={availabilityRuleEndTime}
            onChange={(event) => setAvailabilityRuleEndTime(event.target.value)}
            required
          />
        </label>

        {validationMessage && (
          <p className="status-message" role="alert">
            {validationMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isSavingAvailabilityRule || resources.length === 0}
        >
          {isSavingAvailabilityRule
            ? 'Saving...'
            : editingAvailabilityRuleId
              ? 'Save weekly schedule'
              : 'Create weekly schedule'}
        </button>
        {editingAvailabilityRuleId && (
          <button type="button" onClick={onCancelEdit}>
            Cancel edit
          </button>
        )}
      </form>
    </section>
  )
}
