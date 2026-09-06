import type { ResourceResponse, UserRole } from '../api/types'

interface ResourcesSectionProps {
  currentUserRole: UserRole
  resources: ResourceResponse[]
  isLoadingResources: boolean
  resourceMessage: string
  deletingResourceId: number | null
  onEditResource: (resource: ResourceResponse) => void
  onDeleteResource: (resource: ResourceResponse) => void
}

export function ResourcesSection({
  currentUserRole,
  resources,
  isLoadingResources,
  resourceMessage,
  deletingResourceId,
  onEditResource,
  onDeleteResource,
}: ResourcesSectionProps) {
  return (
    <section className="placeholder-section" aria-labelledby="resources-title">
      <h2 id="resources-title">Resources</h2>
      {isLoadingResources && (
        <p className="status-message" role="status">
          Loading resources...
        </p>
      )}
      {resourceMessage && <p className="status-message">{resourceMessage}</p>}
      {!isLoadingResources && resources.length === 0 && (
        <p className="status-message">No resources found.</p>
      )}
      {resources.length > 0 && (
        <ul className="resource-list">
          {resources.map((resource) => (
            <li key={resource.id}>
              <div>
                <strong>{resource.name}</strong>
                {resource.location && <p>{resource.location}</p>}
                {resource.description && <p>{resource.description}</p>}
              </div>
              <div className="resource-actions">
                <span>{resource.isActive ? 'Active' : 'Inactive'}</span>
                {currentUserRole === 'Admin' && (
                  <>
                    <button type="button" onClick={() => onEditResource(resource)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deletingResourceId === resource.id}
                      onClick={() => onDeleteResource(resource)}
                    >
                      {deletingResourceId === resource.id
                        ? 'Deleting...'
                        : 'Delete'}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
