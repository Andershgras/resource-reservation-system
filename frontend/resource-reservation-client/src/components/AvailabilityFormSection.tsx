import { useRef, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { ResourceResponse } from '../api/types'
import type { FieldErrors } from '../lib/errors'
import type { AvailabilityField } from '../lib/validation'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Field, Input, Select } from '../ui/Field'
import { useFocusFirstInvalid } from '../ui/useFocusFirstInvalid'
import './forms.css'

interface AvailabilityFormSectionProps {
  editingAvailabilityId: number | null
  resources: ResourceResponse[]
  availabilityResourceId: string
  setAvailabilityResourceId: Dispatch<SetStateAction<string>>
  availabilityStartTime: string
  setAvailabilityStartTime: Dispatch<SetStateAction<string>>
  availabilityEndTime: string
  setAvailabilityEndTime: Dispatch<SetStateAction<string>>
  fieldErrors: FieldErrors<AvailabilityField>
  formError: string
  isSavingAvailability: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancelEdit: () => void
}

export function AvailabilityFormSection({
  editingAvailabilityId,
  resources,
  availabilityResourceId,
  setAvailabilityResourceId,
  availabilityStartTime,
  setAvailabilityStartTime,
  availabilityEndTime,
  setAvailabilityEndTime,
  fieldErrors,
  formError,
  isSavingAvailability,
  onSubmit,
  onCancelEdit,
}: AvailabilityFormSectionProps) {
  const formRef = useRef<HTMLFormElement>(null)

  useFocusFirstInvalid(formRef, fieldErrors)

  return (
    <Card
      title={editingAvailabilityId ? 'Edit availability' : 'Create availability'}
      description="A one-off window when a resource can be booked, in addition to its weekly schedule. Times are Copenhagen time."
    >
      <form ref={formRef} className="form" onSubmit={onSubmit} noValidate>
        <Field label="Resource" error={fieldErrors.resourceId}>
          {(props) => (
            <Select
              {...props}
              value={availabilityResourceId}
              onChange={(event) => setAvailabilityResourceId(event.target.value)}
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

        <div className="form-row">
          <Field label="Start time" error={fieldErrors.startTime}>
            {(props) => (
              <Input
                {...props}
                type="datetime-local"
                value={availabilityStartTime}
                onChange={(event) => setAvailabilityStartTime(event.target.value)}
                required
              />
            )}
          </Field>

          <Field label="End time" error={fieldErrors.endTime}>
            {(props) => (
              <Input
                {...props}
                type="datetime-local"
                value={availabilityEndTime}
                onChange={(event) => setAvailabilityEndTime(event.target.value)}
                required
              />
            )}
          </Field>
        </div>

        {formError && <Alert tone="danger">{formError}</Alert>}

        <div className="form-actions">
          {editingAvailabilityId && (
            <Button variant="ghost" onClick={onCancelEdit}>
              Cancel edit
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={isSavingAvailability || resources.length === 0}
          >
            {isSavingAvailability
              ? 'Saving...'
              : editingAvailabilityId
                ? 'Save availability'
                : 'Create availability'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
