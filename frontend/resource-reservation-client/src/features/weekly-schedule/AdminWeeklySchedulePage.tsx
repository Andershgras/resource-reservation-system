import { useMemo, useState, type FormEvent } from 'react'
import type { AvailabilityRuleResponse } from '../../api/types'
import { AvailabilityRuleFormSection } from '../../components/AvailabilityRuleFormSection'
import { AvailabilityRulesSection } from '../../components/AvailabilityRulesSection'
import { useConfirm } from '../../components/confirmContext'
import { toTimeOfDay } from '../../lib/dates'
import {
  errorNotice,
  getErrorMessage,
  getFormErrors,
  hasFieldErrors,
  type FieldErrors,
} from '../../lib/errors'
import { validateAvailabilityRuleForm, type AvailabilityRuleField } from '../../lib/validation'
import type { Notice } from '../../ui/Alert'
import { useResources } from '../resources/resourceQueries'
import {
  useAvailabilityRules,
  useDeleteAvailabilityRule,
  useSaveAvailabilityRule,
} from './availabilityRuleQueries'

const ruleFields: readonly AvailabilityRuleField[] = ['resourceId', 'dayOfWeek', 'startTime', 'endTime']

// /admin/weekly-schedule: weekly availability rules.
export function AdminWeeklySchedulePage() {
  const resourcesQuery = useResources()
  const rulesQuery = useAvailabilityRules()
  const saveRule = useSaveAvailabilityRule()
  const deleteRule = useDeleteAvailabilityRule()
  const confirm = useConfirm()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<AvailabilityRuleField>>({})
  const [formError, setFormError] = useState('')
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
    setFieldErrors({})
    setFormError('')
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    setFormError('')

    const validationErrors = validateAvailabilityRuleForm(resourceId, dayOfWeek, startTime, endTime)
    setFieldErrors(validationErrors)

    if (hasFieldErrors(validationErrors)) {
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
      setNotice({
        tone: 'success',
        text: editingRuleId ? 'Weekly schedule updated.' : 'Weekly schedule created.',
      })
    } catch (error) {
      const formErrors = getFormErrors(error, ruleFields)
      setFieldErrors(formErrors.fieldErrors)
      setFormError(formErrors.message)
    }
  }

  function handleEdit(rule: AvailabilityRuleResponse) {
    setEditingRuleId(rule.id)
    setResourceId(rule.resourceId.toString())
    setDayOfWeek(rule.dayOfWeek.toString())
    setStartTime(toTimeOfDay(rule.startTime))
    setEndTime(toTimeOfDay(rule.endTime))
    setNotice(null)
    setFieldErrors({})
    setFormError('')
  }

  function handleDelete(rule: AvailabilityRuleResponse) {
    confirm({
      title: 'Delete weekly schedule',
      message: `Delete ${rule.dayName} schedule for "${rule.resourceName}"?`,
      confirmLabel: 'Delete weekly schedule',
      onConfirm: async () => {
        setNotice(null)

        try {
          await deleteRule.mutateAsync(rule.id)

          if (editingRuleId === rule.id) {
            resetForm()
          }

          setNotice({ tone: 'success', text: 'Weekly schedule deleted.' })
        } catch (error) {
          setNotice({ tone: 'danger', text: getErrorMessage(error) })
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
        fieldErrors={fieldErrors}
        formError={formError}
        isSavingAvailabilityRule={saveRule.isPending}
        onSubmit={(event) => void handleSave(event)}
        onCancelEdit={resetForm}
      />

      <AvailabilityRulesSection
        availabilityRules={sortedRules}
        isLoadingAvailabilityRules={rulesQuery.isPending}
        notice={notice ?? errorNotice(rulesQuery.error)}
        deletingAvailabilityRuleId={deleteRule.isPending ? deleteRule.variables : null}
        onEditAvailabilityRule={handleEdit}
        onDeleteAvailabilityRule={handleDelete}
      />
    </>
  )
}
