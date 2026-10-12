import { useMemo, useState, type FormEvent } from 'react'
import type { AvailabilityRuleResponse } from '../../api/types'
import { AvailabilityRuleFormSection } from '../../components/AvailabilityRuleFormSection'
import { AvailabilityRulesSection } from '../../components/AvailabilityRulesSection'
import { useConfirm } from '../../components/confirmContext'
import { toTimeOfDay } from '../../lib/dates'
import { getErrorMessage, getQueryErrorMessage } from '../../lib/errors'
import { validateAvailabilityRuleForm } from '../../lib/validation'
import { useResources } from '../resources/resourceQueries'
import {
  useAvailabilityRules,
  useDeleteAvailabilityRule,
  useSaveAvailabilityRule,
} from './availabilityRuleQueries'

// /admin/weekly-schedule: weekly availability rules.
export function AdminWeeklySchedulePage() {
  const resourcesQuery = useResources()
  const rulesQuery = useAvailabilityRules()
  const saveRule = useSaveAvailabilityRule()
  const deleteRule = useDeleteAvailabilityRule()
  const confirm = useConfirm()
  const [message, setMessage] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [resourceId, setResourceId] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  // By resource name, then weekday, then start time.
  const sortedRules = useMemo(
    () =>
      [...(rulesQuery.data ?? [])].sort((first, second) => {
        const resourceComparison = first.resourceName.localeCompare(second.resourceName)

        if (resourceComparison !== 0) {
          return resourceComparison
        }

        if (first.dayOfWeek !== second.dayOfWeek) {
          return first.dayOfWeek - second.dayOfWeek
        }

        return first.startTime.localeCompare(second.startTime)
      }),
    [rulesQuery.data],
  )

  function resetForm() {
    setEditingRuleId(null)
    setResourceId('')
    setDayOfWeek('')
    setStartTime('')
    setEndTime('')
    setValidationMessage('')
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setValidationMessage('')

    const validationError = validateAvailabilityRuleForm(resourceId, dayOfWeek, startTime, endTime)

    if (validationError) {
      setValidationMessage(validationError)
      return
    }

    try {
      await saveRule.mutateAsync({
        id: editingRuleId,
        request: {
          resourceId: Number(resourceId),
          dayOfWeek: Number(dayOfWeek),
          startTime,
          endTime,
        },
      })
      resetForm()
      setMessage(editingRuleId ? 'Weekly schedule updated.' : 'Weekly schedule created.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    }
  }

  function handleEdit(rule: AvailabilityRuleResponse) {
    setEditingRuleId(rule.id)
    setResourceId(rule.resourceId.toString())
    setDayOfWeek(rule.dayOfWeek.toString())
    setStartTime(toTimeOfDay(rule.startTime))
    setEndTime(toTimeOfDay(rule.endTime))
    setMessage('')
    setValidationMessage('')
  }

  function handleDelete(rule: AvailabilityRuleResponse) {
    confirm({
      title: 'Delete weekly schedule',
      message: `Delete ${rule.dayName} schedule for "${rule.resourceName}"?`,
      confirmLabel: 'Delete weekly schedule',
      onConfirm: async () => {
        setMessage('')

        try {
          await deleteRule.mutateAsync(rule.id)

          if (editingRuleId === rule.id) {
            resetForm()
          }

          setMessage('Weekly schedule deleted.')
        } catch (error) {
          setMessage(getErrorMessage(error))
        }
      },
    })
  }

  return (
    <>
      <AvailabilityRuleFormSection
        editingAvailabilityRuleId={editingRuleId}
        resources={resourcesQuery.data ?? []}
        availabilityRuleResourceId={resourceId}
        setAvailabilityRuleResourceId={setResourceId}
        availabilityRuleDayOfWeek={dayOfWeek}
        setAvailabilityRuleDayOfWeek={setDayOfWeek}
        availabilityRuleStartTime={startTime}
        setAvailabilityRuleStartTime={setStartTime}
        availabilityRuleEndTime={endTime}
        setAvailabilityRuleEndTime={setEndTime}
        validationMessage={validationMessage}
        isSavingAvailabilityRule={saveRule.isPending}
        onSubmit={(event) => void handleSave(event)}
        onCancelEdit={resetForm}
      />

      <AvailabilityRulesSection
        availabilityRules={sortedRules}
        isLoadingAvailabilityRules={rulesQuery.isPending}
        availabilityRuleMessage={message || getQueryErrorMessage(rulesQuery.error)}
        deletingAvailabilityRuleId={deleteRule.isPending ? deleteRule.variables : null}
        onEditAvailabilityRule={handleEdit}
        onDeleteAvailabilityRule={handleDelete}
      />
    </>
  )
}
