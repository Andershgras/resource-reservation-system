import { useMemo, useState, type FormEvent } from 'react'
import type { AvailabilityResponse } from '../../api/types'
import { AvailabilityFormSection } from '../../components/AvailabilityFormSection'
import { AvailabilitySection } from '../../components/AvailabilitySection'
import { useConfirm } from '../../components/confirmContext'
import { useUnsavedChangesGuard } from '../../components/useUnsavedChangesGuard'
import { toDateTimeLocalValue } from '../../lib/dates'
import {
  errorNotice,
  getErrorMessage,
  getFormErrors,
  hasFieldErrors,
  type FieldErrors,
} from '../../lib/errors'
import { validateAvailabilityForm, type AvailabilityField } from '../../lib/validation'
import type { Notice } from '../../ui/Alert'
import { useResources } from '../resources/resourceQueries'
import { useAvailabilities, useDeleteAvailability, useSaveAvailability } from './availabilityQueries'

const availabilityFields: readonly AvailabilityField[] = ['resourceId', 'startTime', 'endTime']

const emptyAvailability = { resourceId: '', startTime: '', endTime: '' }

// /admin/availability: one-off availability windows.
export function AdminAvailabilityPage() {
  const resourcesQuery = useResources()
  const availabilitiesQuery = useAvailabilities()
  const saveAvailability = useSaveAvailability()
  const deleteAvailability = useDeleteAvailability()
  const confirm = useConfirm()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<AvailabilityField>>({})
  const [formError, setFormError] = useState('')
  const [editingAvailabilityId, setEditingAvailabilityId] = useState<number | null>(null)
  const [resourceId, setResourceId] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  // The values the form started from, empty or the window being edited.
  const [savedValues, setSavedValues] = useState(emptyAvailability)
  const hasUnsavedChanges =
    resourceId !== savedValues.resourceId ||
    startTime !== savedValues.startTime ||
    endTime !== savedValues.endTime

  useUnsavedChangesGuard(hasUnsavedChanges)

  // By resource name, then by start time.
  const sortedAvailabilities = useMemo(
    () =>
      [...(availabilitiesQuery.data ?? [])].sort((first, second) => {
        const resourceComparison = first.resourceName.localeCompare(second.resourceName)

        if (resourceComparison !== 0) {
          return resourceComparison
        }

        return new Date(first.startTime).getTime() - new Date(second.startTime).getTime()
      }),
    [availabilitiesQuery.data],
  )

  function resetForm() {
    setEditingAvailabilityId(null)
    setResourceId('')
    setStartTime('')
    setEndTime('')
    setSavedValues(emptyAvailability)
    setFieldErrors({})
    setFormError('')
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    setFormError('')

    const validationErrors = validateAvailabilityForm(resourceId, startTime, endTime)
    setFieldErrors(validationErrors)

    if (hasFieldErrors(validationErrors)) {
      return
    }

    try {
      await saveAvailability.mutateAsync({
        id: editingAvailabilityId,
        request: { resourceId: Number(resourceId), startTime, endTime },
      })
      resetForm()
      setNotice({
        tone: 'success',
        text: editingAvailabilityId ? 'Availability updated.' : 'Availability created.',
      })
    } catch (error) {
      const formErrors = getFormErrors(error, availabilityFields)
      setFieldErrors(formErrors.fieldErrors)
      setFormError(formErrors.message)
    }
  }

  function handleEdit(availability: AvailabilityResponse) {
    setEditingAvailabilityId(availability.id)
    setResourceId(availability.resourceId.toString())
    setStartTime(toDateTimeLocalValue(availability.startTime))
    setEndTime(toDateTimeLocalValue(availability.endTime))
    setSavedValues({
      resourceId: availability.resourceId.toString(),
      startTime: toDateTimeLocalValue(availability.startTime),
      endTime: toDateTimeLocalValue(availability.endTime),
    })
    setNotice(null)
    setFieldErrors({})
    setFormError('')
  }

  function handleDelete(availability: AvailabilityResponse) {
    confirm({
      title: 'Delete availability',
      message: `Delete availability for "${availability.resourceName}"?`,
      confirmLabel: 'Delete availability',
      onConfirm: async () => {
        setNotice(null)

        try {
          await deleteAvailability.mutateAsync(availability.id)

          if (editingAvailabilityId === availability.id) {
            resetForm()
          }

          setNotice({ tone: 'success', text: 'Availability deleted.' })
        } catch (error) {
          setNotice({ tone: 'danger', text: getErrorMessage(error) })
        }
      },
    })
  }

  return (
    <>
      <AvailabilityFormSection
        editingAvailabilityId={editingAvailabilityId}
        resources={resourcesQuery.data ?? []}
        availabilityResourceId={resourceId}
        setAvailabilityResourceId={setResourceId}
        availabilityStartTime={startTime}
        setAvailabilityStartTime={setStartTime}
        availabilityEndTime={endTime}
        setAvailabilityEndTime={setEndTime}
        fieldErrors={fieldErrors}
        formError={formError}
        isSavingAvailability={saveAvailability.isPending}
        onSubmit={(event) => void handleSave(event)}
        onCancelEdit={resetForm}
      />

      <AvailabilitySection
        availabilities={sortedAvailabilities}
        isLoadingAvailabilities={availabilitiesQuery.isPending}
        notice={notice ?? errorNotice(availabilitiesQuery.error)}
        deletingAvailabilityId={deleteAvailability.isPending ? deleteAvailability.variables : null}
        onEditAvailability={handleEdit}
        onDeleteAvailability={handleDelete}
      />
    </>
  )
}
