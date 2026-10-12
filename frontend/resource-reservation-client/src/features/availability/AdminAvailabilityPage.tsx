import { useMemo, useState, type FormEvent } from 'react'
import type { AvailabilityResponse } from '../../api/types'
import { AvailabilityFormSection } from '../../components/AvailabilityFormSection'
import { AvailabilitySection } from '../../components/AvailabilitySection'
import { useConfirm } from '../../components/confirmContext'
import { formatDateTime, toDateTimeLocalValue } from '../../lib/dates'
import { getErrorMessage, getQueryErrorMessage } from '../../lib/errors'
import { validateAvailabilityForm } from '../../lib/validation'
import { useResources } from '../resources/resourceQueries'
import { useAvailabilities, useDeleteAvailability, useSaveAvailability } from './availabilityQueries'

// /admin/availability: one-off availability windows.
export function AdminAvailabilityPage() {
  const resourcesQuery = useResources()
  const availabilitiesQuery = useAvailabilities()
  const saveAvailability = useSaveAvailability()
  const deleteAvailability = useDeleteAvailability()
  const confirm = useConfirm()
  const [message, setMessage] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
  const [editingAvailabilityId, setEditingAvailabilityId] = useState<number | null>(null)
  const [resourceId, setResourceId] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

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
    setValidationMessage('')
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setValidationMessage('')

    const validationError = validateAvailabilityForm(resourceId, startTime, endTime)

    if (validationError) {
      setValidationMessage(validationError)
      return
    }

    try {
      await saveAvailability.mutateAsync({
        id: editingAvailabilityId,
        request: { resourceId: Number(resourceId), startTime, endTime },
      })
      resetForm()
      setMessage(editingAvailabilityId ? 'Availability updated.' : 'Availability created.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    }
  }

  function handleEdit(availability: AvailabilityResponse) {
    setEditingAvailabilityId(availability.id)
    setResourceId(availability.resourceId.toString())
    setStartTime(toDateTimeLocalValue(availability.startTime))
    setEndTime(toDateTimeLocalValue(availability.endTime))
    setMessage('')
    setValidationMessage('')
  }

  function handleDelete(availability: AvailabilityResponse) {
    confirm({
      title: 'Delete availability',
      message: `Delete availability for "${availability.resourceName}"?`,
      confirmLabel: 'Delete availability',
      onConfirm: async () => {
        setMessage('')

        try {
          await deleteAvailability.mutateAsync(availability.id)

          if (editingAvailabilityId === availability.id) {
            resetForm()
          }

          setMessage('Availability deleted.')
        } catch (error) {
          setMessage(getErrorMessage(error))
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
        validationMessage={validationMessage}
        isSavingAvailability={saveAvailability.isPending}
        onSubmit={(event) => void handleSave(event)}
        onCancelEdit={resetForm}
      />

      <AvailabilitySection
        currentUserRole="Admin"
        availabilities={sortedAvailabilities}
        isLoadingAvailabilities={availabilitiesQuery.isPending}
        availabilityMessage={message || getQueryErrorMessage(availabilitiesQuery.error)}
        reservationMessage=""
        reservingAvailabilityId={null}
        deletingAvailabilityId={deleteAvailability.isPending ? deleteAvailability.variables : null}
        onReserve={() => undefined}
        onEditAvailability={handleEdit}
        onDeleteAvailability={handleDelete}
        formatDateTime={formatDateTime}
      />
    </>
  )
}
