import type { BookableSlotResponse, ResourceScheduleResponse } from '../api/types'
import { addDaysToDateKey, formatDateHeading, formatTime, getDateKey } from './dates'

// The weekly booking calendar's model. Times are the API's wall-clock times
// (ADR 0001), and all arithmetic is on wall-clock minutes: a booking across
// the hour skipped or repeated by summer time is measured by the clock on the
// wall, as the API does.

export const slotStepMinutes = 15
const minutesPerDay = 24 * 60

const wallClockPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

// Minutes since 1970-01-01T00:00 on the wall clock, or NaN for text that
// isn't an API time.
export function toWallClockMinutes(value: string) {
  const match = wallClockPattern.exec(value)

  if (!match) {
    return Number.NaN
  }

  const [, year, month, day, hour, minute] = match.map(Number)

  return Date.UTC(year, month - 1, day, hour, minute) / 60_000
}

// "2030-01-15T09:00:00" from wall-clock minutes.
export function fromWallClockMinutes(minutes: number) {
  return `${new Date(minutes * 60_000).toISOString().slice(0, 16)}:00`
}

// The Monday of the week that contains a "2030-01-15" date.
export function startOfWeek(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()

  return addDaysToDateKey(dateKey, -((weekday + 6) % 7))
}

export function weekDates(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(weekStart, index))
}

export interface CalendarSegment {
  kind: 'available' | 'reserved'
  // The part of the period on this day.
  start: string
  end: string
  // Minutes after midnight, for placing the segment on the day's timeline.
  startMinute: number
  endMinute: number
  // The whole bookable period, which may continue into the next day. A
  // booking can be made anywhere inside it.
  interval: BookableSlotResponse
}

// Tells segments apart, such as the one being booked.
export function segmentKey(segment: CalendarSegment) {
  return `${segment.kind}-${segment.start}-${segment.end}`
}

export type CalendarDayStatus = 'open' | 'fullyBooked' | 'closed' | 'past'

export interface CalendarDay {
  date: string
  label: string
  status: CalendarDayStatus
  segments: CalendarSegment[]
}

// Splits a period at midnight into one piece per day it touches.
function splitByDay(kind: CalendarSegment['kind'], interval: BookableSlotResponse): CalendarSegment[] {
  const start = toWallClockMinutes(interval.startTime)
  const end = toWallClockMinutes(interval.endTime)

  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return []
  }

  const segments: CalendarSegment[] = []

  for (let dayStart = Math.floor(start / minutesPerDay) * minutesPerDay; dayStart < end; dayStart += minutesPerDay) {
    const pieceStart = Math.max(start, dayStart)
    const pieceEnd = Math.min(end, dayStart + minutesPerDay)

    if (pieceEnd > pieceStart) {
      segments.push({
        kind,
        start: fromWallClockMinutes(pieceStart),
        end: fromWallClockMinutes(pieceEnd),
        startMinute: pieceStart - dayStart,
        endMinute: pieceEnd - dayStart,
        interval,
      })
    }
  }

  return segments
}

// The seven days of a week, each with its free and reserved time in order.
// Every day is shown: a day with only reservations is fully booked, a day with
// neither has no opening hours, and a day before today is past, because the
// schedule leaves out time that has gone. Periods that can't be read, or that
// end before they start, are left out.
export function buildCalendarWeek(
  schedule: ResourceScheduleResponse | null,
  weekStart: string,
  today: string,
): CalendarDay[] {
  const segmentsByDate = new Map<string, CalendarSegment[]>()
  const segments = schedule
    ? [
        ...schedule.bookableSlots.flatMap((slot) => splitByDay('available', slot)),
        ...schedule.reservedSlots.flatMap((slot) => splitByDay('reserved', slot)),
      ]
    : []

  for (const segment of segments) {
    const date = getDateKey(segment.start)
    segmentsByDate.set(date, [...(segmentsByDate.get(date) ?? []), segment])
  }

  return weekDates(weekStart).map((date) => {
    const daySegments = (segmentsByDate.get(date) ?? []).sort(
      (first, second) => first.startMinute - second.startMinute || first.endMinute - second.endMinute,
    )
    const hasAvailable = daySegments.some((segment) => segment.kind === 'available')
    const status: CalendarDayStatus = hasAvailable
      ? 'open'
      : date < today
        ? 'past'
        : daySegments.length > 0
          ? 'fullyBooked'
          : 'closed'

    return { date, label: formatDateHeading(date), status, segments: daySegments }
  })
}

// The hours the day timelines cover: from the earliest start to the latest
// end in the week, in whole hours, and 08:00–17:00 when nothing is scheduled.
export function visibleHours(days: CalendarDay[]) {
  const segments = days.flatMap((day) => day.segments)

  if (segments.length === 0) {
    return { firstHour: 8, lastHour: 17 }
  }

  const firstHour = Math.floor(Math.min(...segments.map((segment) => segment.startMinute)) / 60)
  const lastHour = Math.ceil(Math.max(...segments.map((segment) => segment.endMinute)) / 60)

  return { firstHour, lastHour: Math.max(lastHour, firstHour + 1) }
}

export interface TimeOption {
  value: string
  label: string
}

function toOption(minutes: number, intervalDate: string): TimeOption {
  const value = fromWallClockMinutes(minutes)
  const date = getDateKey(value)

  return {
    value,
    label: date === intervalDate ? formatTime(value) : `${formatDateHeading(date)}, ${formatTime(value)}`,
  }
}

// Wall-clock minutes on the 15-minute grid strictly after `minutes`.
function nextStep(minutes: number) {
  return (Math.floor(minutes / slotStepMinutes) + 1) * slotStepMinutes
}

// Start times inside a bookable period: its own start, then every quarter
// hour before its end. An existing reservation can end at any minute, so the
// period's exact start is always offered.
export function startOptions(interval: BookableSlotResponse): TimeOption[] {
  const start = toWallClockMinutes(interval.startTime)
  const end = toWallClockMinutes(interval.endTime)
  const intervalDate = getDateKey(interval.startTime)

  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return []
  }

  const options = [toOption(start, intervalDate)]

  for (let minutes = nextStep(start); minutes < end; minutes += slotStepMinutes) {
    options.push(toOption(minutes, intervalDate))
  }

  return options
}

// End times after a start: every quarter hour up to the period's end, and the
// period's exact end.
export function endOptions(interval: BookableSlotResponse, startTime: string): TimeOption[] {
  const start = toWallClockMinutes(startTime)
  const end = toWallClockMinutes(interval.endTime)
  const intervalDate = getDateKey(interval.startTime)

  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return []
  }

  const options: TimeOption[] = []

  for (let minutes = nextStep(start); minutes < end; minutes += slotStepMinutes) {
    options.push(toOption(minutes, intervalDate))
  }

  options.push(toOption(end, intervalDate))

  return options
}

// One hour after the start, or the nearest end before that when the period is
// shorter.
export function defaultEndTime(interval: BookableSlotResponse, startTime: string) {
  const target = toWallClockMinutes(startTime) + 60
  const options = endOptions(interval, startTime)
  const fitting = options.filter((option) => toWallClockMinutes(option.value) <= target)

  return (fitting.at(-1) ?? options[0])?.value ?? ''
}

// True when start and end are a booking inside the period.
export function isWithinInterval(interval: BookableSlotResponse, startTime: string, endTime: string) {
  const start = toWallClockMinutes(startTime)
  const end = toWallClockMinutes(endTime)

  return (
    !Number.isNaN(start) &&
    !Number.isNaN(end) &&
    end > start &&
    start >= toWallClockMinutes(interval.startTime) &&
    end <= toWallClockMinutes(interval.endTime)
  )
}

// "45 min", "1 h", "1 h 30 min".
export function formatDuration(startTime: string, endTime: string) {
  const minutes = toWallClockMinutes(endTime) - toWallClockMinutes(startTime)

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return ''
  }

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  if (hours === 0) {
    return `${rest} min`
  }

  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
