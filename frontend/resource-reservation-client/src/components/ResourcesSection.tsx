import type { ResourceResponse } from '../api/types'
import { describeRuleOverrides } from '../lib/bookingRules'
import { Alert, type Notice } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState, LoadingState } from '../ui/States'
import './lists.css'

interface ResourcesSectionProps {
  resources: ResourceResponse[]
  isLoadingResources: boolean
  notice: Notice | null
  deletingResourceId: number | null
  onEditResource: (resource: ResourceResponse) => void
  onDeleteResource: (resource: ResourceResponse) => void
}

export function ResourcesSection({
  resources,
  isLoadingResources,
  notice,
  deletingResourceId,
  onEditResource,
  onDeleteResource,
}: ResourcesSectionProps) {
  return (
    <Card
      title="Resources"
      actions={<Badge label={`${resources.length} resources`}>{resources.length}</Badge>}
    >
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {isLoadingResources && <LoadingState>Loading resources...</LoadingState>}
      {!isLoadingResources && resources.length === 0 && (
        <EmptyState
          title="No resources found."
          description="Create a resource above to make it bookable."
        />
      )}
      {resources.length > 0 && (
        <ul className="item-list">
          {resources.map((resource) => {
            const ruleOverrides = describeRuleOverrides(resource)

            return (
              <li key={resource.id} className={resource.isActive ? 'item' : 'item item-muted'}>
                <div className="item-main">
                  <p className="item-title">
                    <strong>{resource.name}</strong>
                    <Badge tone={resource.isActive ? 'success' : 'neutral'}>
                      {resource.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </p>
                  {(resource.location || resource.description || ruleOverrides) && (
                    <dl className="item-meta">
                      {resource.location && (
                        <div>
                          <dt>Location</dt>
                          <dd>{resource.location}</dd>
                        </div>
                      )}
                      {resource.description && (
                        <div>
                          <dt>Description</dt>
                          <dd>{resource.description}</dd>
                        </div>
                      )}
                      {ruleOverrides && (
                        <div>
                          <dt>Booking rules</dt>
                          <dd>{ruleOverrides}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </div>
                <div className="item-actions">
                  <Button
                    size="sm"
                    aria-label={`Edit ${resource.name}`}
                    onClick={() => onEditResource(resource)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${resource.name}`}
                    disabled={deletingResourceId === resource.id}
                    onClick={() => onDeleteResource(resource)}
                  >
                    {deletingResourceId === resource.id ? 'Deleting...' : 'Delete'}
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
