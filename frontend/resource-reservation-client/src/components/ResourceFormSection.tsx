import { useRef, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { FieldErrors } from '../lib/errors'
import type { ResourceField } from '../lib/validation'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Checkbox, Field, Input } from '../ui/Field'
import { useFocusFirstInvalid } from '../ui/useFocusFirstInvalid'
import './forms.css'

interface ResourceFormSectionProps {
  editingResourceId: number | null
  resourceName: string
  setResourceName: Dispatch<SetStateAction<string>>
  resourceDescription: string
  setResourceDescription: Dispatch<SetStateAction<string>>
  resourceLocation: string
  setResourceLocation: Dispatch<SetStateAction<string>>
  resourceIsActive: boolean
  setResourceIsActive: Dispatch<SetStateAction<boolean>>
  fieldErrors: FieldErrors<ResourceField>
  formError: string
  isSavingResource: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancelEdit: () => void
}

export function ResourceFormSection({
  editingResourceId,
  resourceName,
  setResourceName,
  resourceDescription,
  setResourceDescription,
  resourceLocation,
  setResourceLocation,
  resourceIsActive,
  setResourceIsActive,
  fieldErrors,
  formError,
  isSavingResource,
  onSubmit,
  onCancelEdit,
}: ResourceFormSectionProps) {
  const formRef = useRef<HTMLFormElement>(null)

  useFocusFirstInvalid(formRef, fieldErrors)

  return (
    <Card
      title={editingResourceId ? 'Edit resource' : 'Create resource'}
      description="Anything people can book, such as a room, a desk or a piece of equipment."
    >
      <form ref={formRef} className="form" onSubmit={onSubmit} noValidate>
        <Field label="Name" error={fieldErrors.name}>
          {(props) => (
            <Input
              {...props}
              type="text"
              value={resourceName}
              onChange={(event) => setResourceName(event.target.value)}
              maxLength={100}
              required
            />
          )}
        </Field>

        <div className="form-row">
          <Field label="Description" optional error={fieldErrors.description}>
            {(props) => (
              <Input
                {...props}
                type="text"
                value={resourceDescription}
                onChange={(event) => setResourceDescription(event.target.value)}
                maxLength={500}
              />
            )}
          </Field>

          <Field label="Location" optional error={fieldErrors.location}>
            {(props) => (
              <Input
                {...props}
                type="text"
                value={resourceLocation}
                onChange={(event) => setResourceLocation(event.target.value)}
                maxLength={200}
              />
            )}
          </Field>
        </div>

        {editingResourceId && (
          <Checkbox
            label="Active"
            checked={resourceIsActive}
            onChange={(event) => setResourceIsActive(event.target.checked)}
          />
        )}

        {formError && <Alert tone="danger">{formError}</Alert>}

        <div className="form-actions">
          {editingResourceId && (
            <Button variant="ghost" onClick={onCancelEdit}>
              Cancel edit
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={isSavingResource}>
            {isSavingResource
              ? 'Saving...'
              : editingResourceId
                ? 'Save resource'
                : 'Create resource'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
