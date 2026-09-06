import type { Dispatch, FormEvent, SetStateAction } from 'react'

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
  isSavingResource,
  onSubmit,
  onCancelEdit,
}: ResourceFormSectionProps) {
  return (
    <section className="placeholder-section" aria-labelledby="resource-form-title">
      <h2 id="resource-form-title">
        {editingResourceId ? 'Edit resource' : 'Create resource'}
      </h2>
      <form className="resource-form" onSubmit={onSubmit}>
        <label>
          Name
          <input
            type="text"
            value={resourceName}
            onChange={(event) => setResourceName(event.target.value)}
            maxLength={100}
            required
          />
        </label>

        <label>
          Description
          <input
            type="text"
            value={resourceDescription}
            onChange={(event) => setResourceDescription(event.target.value)}
            maxLength={500}
          />
        </label>

        <label>
          Location
          <input
            type="text"
            value={resourceLocation}
            onChange={(event) => setResourceLocation(event.target.value)}
            maxLength={200}
          />
        </label>

        {editingResourceId && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={resourceIsActive}
              onChange={(event) => setResourceIsActive(event.target.checked)}
            />
            Active
          </label>
        )}

        <button type="submit" disabled={isSavingResource}>
          {isSavingResource
            ? 'Saving...'
            : editingResourceId
              ? 'Save resource'
              : 'Create resource'}
        </button>
        {editingResourceId && (
          <button type="button" onClick={onCancelEdit}>
            Cancel edit
          </button>
        )}
      </form>
    </section>
  )
}
