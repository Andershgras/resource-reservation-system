import { useEffect, useRef, type FormEvent } from 'react'
import type { BookableSlotResponse } from '../../api/types'
import { endOptions, formatDuration, startOptions, type DurationLimits } from '../../lib/calendar'
import { formatDateTimeRange } from '../../lib/dates'
import type { FieldErrors } from '../../lib/errors'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { Field, Select } from '../../ui/Field'
import './BookingPanel.css'

export type BookingField = 'startTime' | 'endTime'

interface BookingPanelProps {
  // Booking a new time, or moving an existing booking to it.
  mode: 'book' | 'move'
  resourceName: string
  interval: BookableSlotResponse
  // How long a booking may be, from the resource's booking rules.
  limits: DurationLimits
  startTime: string
  endTime: string
  onStartTimeChange: (value: string) => void
  onEndTimeChange: (value: string) => void
  fieldErrors: FieldErrors<BookingField>
  formError: string
  isReserving: boolean
  onReserve: () => void
  onCancel: () => void
}

// Chooses a start and end inside one free period, in 15-minute steps, and books
// it. Focus moves to the start time when the panel opens.
export function BookingPanel({
  mode,
  resourceName,
  interval,
  limits,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  fieldErrors,
  formError,
  isReserving,
  onReserve,
  onCancel,
}: BookingPanelProps) {
  const startRef = useRef<HTMLSelectElement>(null)
  const period = formatDateTimeRange(interval.startTime, interval.endTime)
  const duration = formatDuration(startTime, endTime)

  useEffect(() => {
    startRef.current?.focus()
  }, [interval.startTime, interval.endTime])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onReserve()
  }

  return (
    <form className="booking-panel" onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend>
          <span className="booking-panel-title">
            {mode === 'move' ? `Move to ${resourceName}` : `Book ${resourceName}`}
          </span>{' '}
          <span className="booking-panel-period">Free {period}</span>
        </legend>

        <div className="booking-panel-times">
          <Field label="Start" error={fieldErrors.startTime}>
            {(props) => (
              <Select
                {...props}
                ref={startRef}
                value={startTime}
                onChange={(event) => onStartTimeChange(event.target.value)}
              >
                {startOptions(interval, limits).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="End" error={fieldErrors.endTime}>
            {(props) => (
              <Select
                {...props}
                value={endTime}
                onChange={(event) => onEndTimeChange(event.target.value)}
              >
                {endOptions(interval, startTime, limits).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <p className="booking-panel-duration" aria-live="polite">
            {duration && <>Duration <strong>{duration}</strong></>}
          </p>
        </div>
      </fieldset>

      {formError && <Alert tone="danger">{formError}</Alert>}

      <div className="booking-panel-actions">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={isReserving}>
          {mode === 'move'
            ? isReserving ? 'Moving...' : 'Move booking'
            : isReserving ? 'Reserving...' : 'Reserve'}
        </Button>
      </div>
    </form>
  )
}
