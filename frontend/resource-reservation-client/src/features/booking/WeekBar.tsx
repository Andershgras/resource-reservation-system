import { startOfWeek } from '../../lib/calendar'
import { addDaysToDateKey, formatDate } from '../../lib/dates'
import { Button } from '../../ui/Button'
import { Field, Input } from '../../ui/Field'

interface WeekBarProps {
  // The Monday of the week shown.
  weekStart: string
  // The Monday of this week. Earlier weeks can't be chosen.
  thisWeek: string
  // Moves by whole weeks. Given as steps, so quick clicks add up.
  onStep: (weeks: number) => void
  onShowWeek: (weekStart: string) => void
}

// The week a calendar shows, with buttons to move between weeks and a date
// to jump to. Shared by the booking and admin calendars.
export function WeekBar({ weekStart, thisWeek, onStep, onShowWeek }: WeekBarProps) {
  return (
    <div className="booking-week-bar">
      <p className="booking-week-label" aria-live="polite">
        <span className="visually-hidden">Showing the week </span>
        {formatDate(weekStart)} – {formatDate(addDaysToDateKey(weekStart, 6))}
      </p>
      <div className="booking-week-actions" role="group" aria-label="Choose week">
        <Button size="sm" disabled={weekStart <= thisWeek} onClick={() => onStep(-1)}>
          Previous week
        </Button>
        <Button size="sm" disabled={weekStart === thisWeek} onClick={() => onShowWeek(thisWeek)}>
          This week
        </Button>
        <Button size="sm" onClick={() => onStep(1)}>
          Next week
        </Button>
      </div>
      <Field label="Go to date" className="booking-week-date">
        {(props) => (
          <Input
            {...props}
            type="date"
            value={weekStart}
            onChange={(event) => {
              if (event.target.value) {
                onShowWeek(startOfWeek(event.target.value))
              }
            }}
          />
        )}
      </Field>
    </div>
  )
}
