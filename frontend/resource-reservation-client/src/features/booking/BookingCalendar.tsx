import type { CSSProperties, ReactNode } from 'react'
import { segmentKey, type CalendarDay, type CalendarDayStatus, type CalendarSegment } from '../../lib/calendar'
import { formatDate, formatTimeRange } from '../../lib/dates'
import './BookingCalendar.css'

interface BookingCalendarProps {
  days: CalendarDay[]
  firstHour: number
  lastHour: number
  // The free period being booked, if any.
  selectedSegment: CalendarSegment | null
  onSelectSegment: (segment: CalendarSegment) => void
  // Shown inside the day of the selected period, on small screens, so the
  // booking form opens next to what was chosen.
  panelInDay?: ReactNode
}

const statusLabels: Record<CalendarDayStatus, string> = {
  open: '',
  fullyBooked: 'Fully booked',
  closed: 'Closed',
  past: 'Past',
}

// A week of free and reserved time. Each day is a section with its periods in
// time order, so it reads in order without styles and on small screens. On
// wide screens each period is placed on an hour grid by its exact minutes.
export function BookingCalendar({
  days,
  firstHour,
  lastHour,
  selectedSegment,
  onSelectSegment,
  panelInDay,
}: BookingCalendarProps) {
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index)
  const style = { '--calendar-hours': lastHour - firstHour } as CSSProperties

  return (
    <div className="calendar" style={style}>
      <ul className="calendar-legend" aria-label="Legend">
        <li><span className="calendar-swatch calendar-swatch-available" aria-hidden="true" />Available</li>
        <li><span className="calendar-swatch calendar-swatch-reserved" aria-hidden="true" />Reserved</li>
      </ul>

      <div className="calendar-grid">
        <ol className="calendar-hours" aria-hidden="true">
          {hours.map((hour) => (
            <li key={hour} style={{ '--calendar-offset': hour - firstHour } as CSSProperties}>
              {hour.toString().padStart(2, '0')}:00
            </li>
          ))}
        </ol>

        {days.map((day) => {
          const headingId = `calendar-day-${day.date}`
          const statusLabel = statusLabels[day.status]

          return (
            <section
              key={day.date}
              className={`calendar-day calendar-day-${day.status}`}
              aria-labelledby={headingId}
            >
              <header className="calendar-day-header">
                <h3 id={headingId}>{day.label}</h3>
                {statusLabel && <p className="calendar-day-status">{statusLabel}</p>}
              </header>

              {day.segments.length > 0 && (
                <ul className="calendar-track">
                  {day.segments.map((segment) => (
                    <li
                      key={segmentKey(segment)}
                      className={`calendar-segment calendar-segment-${segment.kind}`}
                      style={{
                        '--calendar-start': segment.startMinute / 60 - firstHour,
                        '--calendar-length': (segment.endMinute - segment.startMinute) / 60,
                      } as CSSProperties}
                    >
                      <SegmentContent
                        segment={segment}
                        isSelected={selectedSegment !== null && segmentKey(selectedSegment) === segmentKey(segment)}
                        onSelect={onSelectSegment}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {panelInDay && selectedSegment && dayOf(selectedSegment) === day.date && (
                <div className="calendar-day-panel">{panelInDay}</div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function dayOf(segment: CalendarSegment) {
  return segment.start.slice(0, 10)
}

function SegmentContent({ segment, isSelected, onSelect }: {
  segment: CalendarSegment
  isSelected: boolean
  onSelect: (segment: CalendarSegment) => void
}) {
  const times = formatTimeRange(segment.start, segment.end)

  if (segment.kind === 'reserved') {
    return (
      <p className="calendar-segment-body">
        <span className="calendar-segment-kind">Reserved</span>{' '}
        <span className="calendar-segment-times">{times}</span>
      </p>
    )
  }

  return (
    <button
      type="button"
      className="calendar-segment-body"
      aria-pressed={isSelected}
      aria-label={`Available ${formatDate(segment.start)}, ${times}. Choose a time`}
      onClick={() => onSelect(segment)}
    >
      <span className="calendar-segment-kind">Available</span>{' '}
      <span className="calendar-segment-times">{times}</span>
    </button>
  )
}
