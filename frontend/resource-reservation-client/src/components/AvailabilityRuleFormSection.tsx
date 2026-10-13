import { useRef, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { ResourceResponse } from '../api/types'
import type { FieldErrors } from '../lib/errors'
import type { AvailabilityRuleField } from '../lib/validation'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Field, Input, Select } from '../ui/Field'
import { useFocusFirstInvalid } from '../ui/useFocusFirstInvalid'
import './forms.css'

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
  fieldErrors: FieldErrors<AvailabilityRuleField>
  formError: string
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
  fieldErrors,
  formError,
  isSavingAvailabilityRule,
  onSubmit,
  onCancelEdit,
}: AvailabilityRuleFormSectionProps) {
  const formRef = useRef<HTMLFormElement>(null)

  useFocusFirstInvalid(formRef, fieldErrors)

  return (
    <Card
      title={editingAvailabilityRuleId ? 'Edit weekly schedule' : 'Create weekly schedule'}
      description="Opening hours that repeat every week, such as Monday 08:00–16:00. Times are Copenhagen time."
    >
      <form ref={formRef} className="form" onSubmit={onSubmit} noValidate>
        <div className="form-row">
          <Field label="Resource" error={fieldErrors.resourceId}>
            {(props) => (
              <Select
                {...props}
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
              </Select>
            )}
          </Field>

          <Field label="Weekday" error={fieldErrors.dayOfWeek}>
            {(props) => (
              <Select
                {...props}
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
              </Select>
            )}
          </Field>
        </div>

        <div className="form-row">
          <Field label="Start time" error={fieldErrors.startTime}>
            {(props) => (
              <Input
                {...props}
                type="time"
                value={availabilityRuleStartTime}
                onChange={(event) => setAvailabilityRuleStartTime(event.target.value)}
                required
              />
            )}
          </Field>

          <Field label="End time" error={fieldErrors.endTime}>
            {(props) => (
              <Input
                {...props}
                type="time"
                value={availabilityRuleEndTime}
                onChange={(event) => setAvailabilityRuleEndTime(event.target.value)}
                required
              />
            )}
          </Field>
        </div>

        {formError && <Alert tone="danger">{formError}</Alert>}

        <div className="form-actions">
          {editingAvailabilityRuleId && (
            <Button variant="ghost" onClick={onCancelEdit}>
              Cancel edit
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={isSavingAvailabilityRule || resources.length === 0}
          >
            {isSavingAvailabilityRule
              ? 'Saving...'
              : editingAvailabilityRuleId
                ? 'Save weekly schedule'
                : 'Create weekly schedule'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
