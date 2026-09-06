import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { ResourceResponse } from '../api/types'

interface AvailabilityFormSectionProps {
  editingAvailabilityId: number | null
  resources: ResourceResponse[]
  availabilityResourceId: string
  setAvailabilityResourceId: Dispatch<SetStateAction<string>>
  availabilityStartTime: string
  setAvailabilityStartTime: Dispatch<SetStateAction<string>>
  availabilityEndTime: string
  setAvailabilityEndTime: Dispatch<SetStateAction<string>>
  validationMessage: string
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
  validationMessage,
  isSavingAvailability,
  onSubmit,
  onCancelEdit,
}: AvailabilityFormSectionProps) {
  return (
    <section className="placeholder-section" aria-labelledby="availability-form-title">
      <h2 id="availability-form-title">
        {editingAvailabilityId ? 'Edit availability' : 'Create availability'}
      </h2>
      <form className="resource-form" onSubmit={onSubmit} noValidate>
        <label>
          Resource
          <select
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
          </select>
        </label>

        <label>
          Start time
          <input
            type="datetime-local"
            value={availabilityStartTime}
            onChange={(event) => setAvailabilityStartTime(event.target.value)}
            required
          />
        </label>

        <label>
          End time
          <input
            type="datetime-local"
            value={availabilityEndTime}
            onChange={(event) => setAvailabilityEndTime(event.target.value)}
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
          disabled={isSavingAvailability || resources.length === 0}
        >
          {isSavingAvailability
            ? 'Saving...'
            : editingAvailabilityId
              ? 'Save availability'
              : 'Create availability'}
        </button>
        {editingAvailabilityId && (
          <button type="button" onClick={onCancelEdit}>
            Cancel edit
          </button>
        )}
      </form>
    </section>
  )
}
