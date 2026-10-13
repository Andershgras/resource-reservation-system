import { useState, type FormEvent } from 'react'
import type { ResourceResponse } from '../../api/types'
import { useConfirm } from '../../components/confirmContext'
import { ResourceFormSection } from '../../components/ResourceFormSection'
import { ResourcesSection } from '../../components/ResourcesSection'
import { useUnsavedChangesGuard } from '../../components/useUnsavedChangesGuard'
import {
  bookingRuleFields,
  emptyBookingRules,
  toBookingRuleOverrides,
  toBookingRulesDraft,
  type BookingRuleField,
  type BookingRulesDraft,
} from '../../lib/bookingRules'
import {
  errorNotice,
  getErrorMessage,
  getFormErrors,
  hasFieldErrors,
  type FieldErrors,
} from '../../lib/errors'
import { emptyToNull } from '../../lib/text'
import { validateResourceForm, type ResourceField } from '../../lib/validation'
import type { Notice } from '../../ui/Alert'
import { useBookingPolicy, useDeleteResource, useResources, useSaveResource } from './resourceQueries'

const resourceFields: readonly ResourceField[] = ['name', 'description', 'location', ...bookingRuleFields]

const emptyResource = {
  name: '',
  description: '',
  location: '',
  isActive: true,
  bookingRules: emptyBookingRules,
}

// /admin/resources: create, edit and delete resources.
export function AdminResourcesPage() {
  const resourcesQuery = useResources()
  const bookingPolicyQuery = useBookingPolicy()
  const saveResource = useSaveResource()
  const deleteResource = useDeleteResource()
  const confirm = useConfirm()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [editingResourceId, setEditingResourceId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [bookingRules, setBookingRules] = useState<BookingRulesDraft>(emptyBookingRules)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ResourceField>>({})
  const [formError, setFormError] = useState('')
  // The values the form started from, empty or the resource being edited.
  const [savedValues, setSavedValues] = useState(emptyResource)
  const hasUnsavedChanges =
    name !== savedValues.name ||
    description !== savedValues.description ||
    location !== savedValues.location ||
    isActive !== savedValues.isActive ||
    bookingRuleFields.some((field) => bookingRules[field] !== savedValues.bookingRules[field])

  useUnsavedChangesGuard(hasUnsavedChanges)

  function resetForm() {
    setEditingResourceId(null)
    setName('')
    setDescription('')
    setLocation('')
    setIsActive(true)
    setBookingRules(emptyBookingRules)
    setSavedValues(emptyResource)
    setFieldErrors({})
    setFormError('')
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    setFormError('')

    const validationErrors = validateResourceForm(name, bookingRules, bookingPolicyQuery.data)
    setFieldErrors(validationErrors)

    if (hasFieldErrors(validationErrors)) {
      return
    }

    try {
      if (editingResourceId) {
        await saveResource.mutateAsync({
          id: editingResourceId,
          request: {
            name: name.trim(),
            description: emptyToNull(description),
            location: emptyToNull(location),
            isActive,
            ...toBookingRuleOverrides(bookingRules),
          },
        })
      } else {
        await saveResource.mutateAsync({
          id: null,
          request: {
            name: name.trim(),
            description: emptyToNull(description),
            location: emptyToNull(location),
            ...toBookingRuleOverrides(bookingRules),
          },
        })
      }

      resetForm()
      setNotice({ tone: 'success', text: editingResourceId ? 'Resource updated.' : 'Resource created.' })
    } catch (error) {
      const formErrors = getFormErrors(error, resourceFields)
      setFieldErrors(formErrors.fieldErrors)
      setFormError(formErrors.message)
    }
  }

  function handleEdit(resource: ResourceResponse) {
    setEditingResourceId(resource.id)
    setName(resource.name)
    setDescription(resource.description ?? '')
    setLocation(resource.location ?? '')
    setIsActive(resource.isActive)
    setBookingRules(toBookingRulesDraft(resource))
    setSavedValues({
      name: resource.name,
      description: resource.description ?? '',
      location: resource.location ?? '',
      isActive: resource.isActive,
      bookingRules: toBookingRulesDraft(resource),
    })
    setNotice(null)
    setFieldErrors({})
    setFormError('')
  }

  function handleDelete(resource: ResourceResponse) {
    confirm({
      title: 'Delete resource',
      message: `Delete resource "${resource.name}"?`,
      confirmLabel: 'Delete resource',
      onConfirm: async () => {
        setNotice(null)

        try {
          await deleteResource.mutateAsync(resource.id)

          if (editingResourceId === resource.id) {
            resetForm()
          }

          setNotice({ tone: 'success', text: 'Resource deleted.' })
        } catch (error) {
          setNotice({ tone: 'danger', text: getErrorMessage(error) })
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
        bookingRules={bookingRules}
        onBookingRuleChange={(field: BookingRuleField, value: string) =>
          setBookingRules((current) => ({ ...current, [field]: value }))}
        defaultPolicy={bookingPolicyQuery.data}
        fieldErrors={fieldErrors}
        formError={formError}
        isSavingResource={saveResource.isPending}
        onSubmit={(event) => void handleSave(event)}
        onCancelEdit={resetForm}
      />

      <ResourcesSection
        resources={resourcesQuery.data ?? []}
        isLoadingResources={resourcesQuery.isPending}
        notice={notice ?? errorNotice(resourcesQuery.error)}
        deletingResourceId={deleteResource.isPending ? deleteResource.variables : null}
        onEditResource={handleEdit}
        onDeleteResource={handleDelete}
      />
    </>
  )
}
