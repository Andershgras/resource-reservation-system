import { useMemo, useRef, useState, type FormEvent } from 'react'
import type { ClosureResponse, CreateClosureRequest, ReservationResponse } from '../../api/types'
import { useConfirm } from '../../components/confirmContext'
import { ReservationsSection } from '../../components/ReservationsSection'
import { useUnsavedChangesGuard } from '../../components/useUnsavedChangesGuard'
import { formatDateTimeRange, formatInstant } from '../../lib/dates'
import {
  getErrorMessage,
  getFormErrors,
  hasFieldErrors,
  type FieldErrors,
} from '../../lib/errors'
import { validateClosureForm, type ClosureField } from '../../lib/validation'
import { Alert, type Notice } from '../../ui/Alert'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Field, Input, Select } from '../../ui/Field'
import { EmptyState, LoadingState } from '../../ui/States'
import { useFocusFirstInvalid } from '../../ui/useFocusFirstInvalid'
import { useAllReservations, useCancelReservation } from '../reservations/reservationQueries'
import { useResources } from '../resources/resourceQueries'
import { useClosures, useCreateClosure, useDeleteClosure, usePreviewClosure } from './closureQueries'
import '../../components/forms.css'
import '../../components/lists.css'

const closureFields: readonly ClosureField[] = ['resourceId', 'startTime', 'endTime', 'reason']

const emptyClosure = { resourceId: '', startTime: '', endTime: '', reason: '' }

// /admin/closures: close a resource for a holiday or maintenance. Before a
// closure is saved, the admin sees the bookings inside it. They are never
// cancelled automatically; the admin can cancel them afterwards.
export function AdminClosuresPage() {
  const resourcesQuery = useResources()
  const closuresQuery = useClosures()
  const reservationsQuery = useAllReservations()
  const previewClosure = usePreviewClosure()
  const createClosure = useCreateClosure()
  const deleteClosure = useDeleteClosure()
  const cancelReservation = useCancelReservation()
  const confirm = useConfirm()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState(emptyClosure)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ClosureField>>({})
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  // The bookings inside the closure saved last, by ID, so they stay current
  // as the reservation list reloads after a cancellation.
  const [affectedIds, setAffectedIds] = useState<number[]>([])

  useFocusFirstInvalid(formRef, fieldErrors)
  useUnsavedChangesGuard(Object.values(values).some((value) => value !== ''))

  const affectedReservations = useMemo(
    () => (reservationsQuery.data ?? []).filter((reservation) => affectedIds.includes(reservation.id)),
    [reservationsQuery.data, affectedIds],
  )

  function setValue(field: keyof typeof emptyClosure, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function showFormErrors(error: unknown) {
    const formErrors = getFormErrors(error, closureFields)
    setFieldErrors(formErrors.fieldErrors)
    setFormError(formErrors.message)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    setFormError('')

    const validationErrors = validateClosureForm(values.resourceId, values.startTime, values.endTime, values.reason)
    setFieldErrors(validationErrors)

    if (hasFieldErrors(validationErrors)) {
      return
    }

    const request: CreateClosureRequest = {
      resourceId: Number(values.resourceId),
      startTime: values.startTime,
      endTime: values.endTime,
      reason: values.reason.trim(),
    }
    const resourceName = resourcesQuery.data?.find((resource) => resource.id === request.resourceId)?.name ?? 'resource'
    let affected: ReservationResponse[]

    try {
      affected = await previewClosure.mutateAsync(request)
    } catch (error) {
      showFormErrors(error)
      return
    }

    confirm({
      title: `Close ${resourceName}?`,
      message: affected.length === 0
        ? `No active bookings fall inside ${formatDateTimeRange(request.startTime, request.endTime)}.`
        : `${affected.length === 1 ? '1 active booking falls' : `${affected.length} active bookings fall`} inside ` +
          `${formatDateTimeRange(request.startTime, request.endTime)}. ` +
          "They won't be cancelled. You can cancel them afterwards.",
      details: affected.length > 0 && <AffectedList reservations={affected} />,
      confirmLabel: 'Close resource',
      tone: 'primary',
      onConfirm: async () => {
        try {
          const created = await createClosure.mutateAsync(request)
          const count = created.affectedReservations.length

          setValues(emptyClosure)
          setFieldErrors({})
          setAffectedIds(created.affectedReservations.map((reservation) => reservation.id))
          setNotice({
            tone: 'success',
            text: `${resourceName} is closed ${formatDateTimeRange(request.startTime, request.endTime)}. ` +
              (count === 0
                ? 'No bookings are affected.'
                : `${count === 1 ? '1 booking is' : `${count} bookings are`} inside the closure and still active.`),
          })
        } catch (error) {
          // The dialog closes, and the form shows why, beside the field when
          // the API says which.
          showFormErrors(error)
        }
      },
    })
  }

  function handleDelete(closure: ClosureResponse) {
    confirm({
      title: 'Delete closure',
      message: `Delete the closure of "${closure.resourceName}" for "${closure.reason}"? ` +
        'Its time becomes bookable again, unless another closure covers it.',
      confirmLabel: 'Delete closure',
      onConfirm: async () => {
        setNotice(null)

        try {
          await deleteClosure.mutateAsync(closure.id)
          setNotice({ tone: 'success', text: 'Closure deleted.' })
        } catch (error) {
          setNotice({ tone: 'danger', text: getErrorMessage(error) })
        }
      },
    })
  }

  function handleCancelReservation(reservation: ReservationResponse) {
    confirm({
      title: 'Cancel reservation',
      message: `Cancel ${reservation.userName}'s reservation for "${reservation.resourceName}"?`,
      confirmLabel: 'Cancel reservation',
      onConfirm: async () => {
        try {
          await cancelReservation.mutateAsync(reservation)
          setNotice({ tone: 'success', text: 'Reservation cancelled.' })
        } catch (error) {
          setNotice({ tone: 'danger', text: getErrorMessage(error) })
        }
      },
    })
  }

  const isSaving = previewClosure.isPending || createClosure.isPending
  const closures = closuresQuery.data ?? []

  return (
    <>
      <Card
        title="Close a resource"
        description="For a holiday or maintenance. Bookings inside the closure are shown first, and are never cancelled automatically."
      >
        <form ref={formRef} className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <Field label="Resource" error={fieldErrors.resourceId}>
            {(props) => (
              <Select {...props} value={values.resourceId} onChange={(event) => setValue('resourceId', event.target.value)}>
                <option value="">Select a resource</option>
                {(resourcesQuery.data ?? []).map((resource) => (
                  <option key={resource.id} value={resource.id}>{resource.name}</option>
                ))}
              </Select>
            )}
          </Field>
          <div className="form-row">
            <Field label="Start" error={fieldErrors.startTime}>
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  value={values.startTime}
                  onChange={(event) => setValue('startTime', event.target.value)}
                />
              )}
            </Field>
            <Field label="End" error={fieldErrors.endTime}>
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  value={values.endTime}
                  onChange={(event) => setValue('endTime', event.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label="Reason" hint="Shown to everyone in the calendar." error={fieldErrors.reason}>
            {(props) => (
              <Input
                {...props}
                type="text"
                maxLength={200}
                value={values.reason}
                onChange={(event) => setValue('reason', event.target.value)}
              />
            )}
          </Field>

          {formError && <Alert tone="danger">{formError}</Alert>}

          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Checking...' : 'Check affected bookings'}
            </Button>
          </div>
        </form>
      </Card>

      {affectedReservations.length > 0 && (
        <ReservationsSection
          title="Bookings inside the new closure"
          reservations={affectedReservations}
          isLoading={false}
          notice={null}
          showUser
          cancellingReservationId={cancelReservation.isPending ? cancelReservation.variables.id : null}
          onCancelReservation={handleCancelReservation}
        />
      )}

      <Card
        title="Closures"
        actions={<Badge label={`${closures.length} closures`}>{closures.length}</Badge>}
      >
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        {!notice && closuresQuery.error && <Alert tone="danger">{getErrorMessage(closuresQuery.error)}</Alert>}
        {closuresQuery.isPending && <LoadingState>Loading closures...</LoadingState>}
        {!closuresQuery.isPending && closures.length === 0 && (
          <EmptyState title="No closures." description="Resources follow their opening hours." />
        )}
        {closures.length > 0 && (
          <ul className="item-list">
            {closures.map((closure) => {
              const period = formatDateTimeRange(closure.startTime, closure.endTime)

              return (
                <li key={closure.id} className="item">
                  <div className="item-main">
                    <p className="item-title"><strong>{closure.resourceName}</strong></p>
                    <dl className="item-meta">
                      <div>
                        <dt className="visually-hidden">Time</dt>
                        <dd>{period}</dd>
                      </div>
                      <div>
                        <dt>Reason</dt>
                        <dd>{closure.reason}</dd>
                      </div>
                      <div>
                        <dt>Added</dt>
                        <dd>
                          {formatInstant(closure.createdAt)}
                          {closure.createdByName && ` by ${closure.createdByName}`}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="item-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete closure of ${closure.resourceName}, ${period}`}
                      disabled={deleteClosure.isPending && deleteClosure.variables === closure.id}
                      onClick={() => handleDelete(closure)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}

// Who booked what inside a closure, for the confirmation dialog.
function AffectedList({ reservations }: { reservations: ReservationResponse[] }) {
  return (
    <ul className="affected-list" aria-label="Affected bookings">
      {reservations.map((reservation) => (
        <li key={reservation.id}>
          {formatDateTimeRange(reservation.startTime, reservation.endTime)}: {reservation.userName} ({reservation.userEmail})
        </li>
      ))}
    </ul>
  )
}
