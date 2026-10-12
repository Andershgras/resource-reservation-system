import { useState, type FormEvent } from 'react'
import type { ResourceResponse } from '../../api/types'
import { useConfirm } from '../../components/confirmContext'
import { ResourceFormSection } from '../../components/ResourceFormSection'
import { ResourcesSection } from '../../components/ResourcesSection'
import { getErrorMessage, getQueryErrorMessage } from '../../lib/errors'
import { emptyToNull } from '../../lib/text'
import { useDeleteResource, useResources, useSaveResource } from './resourceQueries'

// /admin/resources: create, edit and delete resources.
export function AdminResourcesPage() {
  const resourcesQuery = useResources()
  const saveResource = useSaveResource()
  const deleteResource = useDeleteResource()
  const confirm = useConfirm()
  const [message, setMessage] = useState('')
  const [editingResourceId, setEditingResourceId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [isActive, setIsActive] = useState(true)

  function resetForm() {
    setEditingResourceId(null)
    setName('')
    setDescription('')
    setLocation('')
    setIsActive(true)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    try {
      if (editingResourceId) {
        await saveResource.mutateAsync({
          id: editingResourceId,
          request: {
            name: name.trim(),
            description: emptyToNull(description),
            location: emptyToNull(location),
            isActive,
          },
        })
      } else {
        await saveResource.mutateAsync({
          id: null,
          request: {
            name: name.trim(),
            description: emptyToNull(description),
            location: emptyToNull(location),
          },
        })
      }

      resetForm()
      setMessage(editingResourceId ? 'Resource updated.' : 'Resource created.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    }
  }

  function handleEdit(resource: ResourceResponse) {
    setEditingResourceId(resource.id)
    setName(resource.name)
    setDescription(resource.description ?? '')
    setLocation(resource.location ?? '')
    setIsActive(resource.isActive)
    setMessage('')
  }

  function handleDelete(resource: ResourceResponse) {
    confirm({
      title: 'Delete resource',
      message: `Delete resource "${resource.name}"?`,
      confirmLabel: 'Delete resource',
      onConfirm: async () => {
        setMessage('')

        try {
          await deleteResource.mutateAsync(resource.id)

          if (editingResourceId === resource.id) {
            resetForm()
          }

          setMessage('Resource deleted.')
        } catch (error) {
          setMessage(getErrorMessage(error))
        }
      },
    })
  }

  return (
    <>
      <ResourceFormSection
        editingResourceId={editingResourceId}
        resourceName={name}
        setResourceName={setName}
        resourceDescription={description}
        setResourceDescription={setDescription}
        resourceLocation={location}
        setResourceLocation={setLocation}
        resourceIsActive={isActive}
        setResourceIsActive={setIsActive}
        isSavingResource={saveResource.isPending}
        onSubmit={(event) => void handleSave(event)}
        onCancelEdit={resetForm}
      />

      <ResourcesSection
        currentUserRole="Admin"
        resources={resourcesQuery.data ?? []}
        isLoadingResources={resourcesQuery.isPending}
        resourceMessage={message || getQueryErrorMessage(resourcesQuery.error)}
        deletingResourceId={deleteResource.isPending ? deleteResource.variables : null}
        onEditResource={handleEdit}
        onDeleteResource={handleDelete}
      />
    </>
  )
}
