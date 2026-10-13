// Date helpers for the API's wall-clock times, such as "2030-01-15T09:00:00".
// They carry no offset and are local times in the scheduling time zone
// (ADR 0001). The helpers read the fields from the text, never through the
// browser's time zone, so a viewer abroad sees the same times as one in
// Copenhagen.
//
// Shown dates use en-GB names and a 24-hour clock: "Tue 15 Jan 2030, 09:00".

export const schedulingTimeZone = 'Europe/Copenhagen'

const wallClockPattern = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/
const timeOfDayPattern = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function parseWallClock(value: string): WallClock | null {
  const match = wallClockPattern.exec(value)

  if (!match) {
    return null
  }

  const [, year, month, day, hour = '00', minute = '00'] = match

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  }
}

// Formatting a UTC date in UTC shows its fields unchanged, whatever the
// browser's own time zone is.
function toUtcDate({ year, month, day }: WallClock) {
  return new Date(Date.UTC(year, month - 1, day))
}

const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })

function pad(value: number) {
  return value.toString().padStart(2, '0')
}

function datePart(wallClock: WallClock, withYear: boolean) {
  const date = toUtcDate(wallClock)
  const text = `${weekdayFormat.format(date)} ${wallClock.day} ${monthFormat.format(date)}`

  return withYear ? `${text} ${wallClock.year}` : text
}

function timePart({ hour, minute }: WallClock) {
  return `${pad(hour)}:${pad(minute)}`
}

// "Tue 15 Jan 2030" from "2030-01-15" or "2030-01-15T09:00:00".
export function formatDate(value: string) {
  const wallClock = parseWallClock(value)

  return wallClock ? datePart(wallClock, true) : value
}

// "Tue 15 Jan", for day headings where the year is clear from context.
export function formatDateHeading(value: string) {
  const wallClock = parseWallClock(value)

  return wallClock ? datePart(wallClock, false) : value
}

// "Tue 15 Jan 2030, 09:00".
export function formatDateTime(value: string) {
  const wallClock = parseWallClock(value)

  return wallClock ? `${datePart(wallClock, true)}, ${timePart(wallClock)}` : value
}

// "09:00" from an API time ("2030-01-15T09:00:00") or time of day ("09:00:00").
export function formatTime(value: string) {
  const timeOfDay = timeOfDayPattern.exec(value)

  if (timeOfDay) {
    return `${timeOfDay[1]}:${timeOfDay[2]}`
  }

  const wallClock = parseWallClock(value)

  return wallClock ? timePart(wallClock) : value
}

// "09:00–11:00".
export function formatTimeRange(start: string, end: string) {
  return `${formatTime(start)}–${formatTime(end)}`
}

// "Tue 15 Jan 2030, 09:00–11:00", or with both dates when the range crosses
// midnight: "Tue 15 Jan 2030, 22:00 – Wed 16 Jan 2030, 02:00".
export function formatDateTimeRange(start: string, end: string) {
  if (getDateKey(start) === getDateKey(end)) {
    return `${formatDate(start)}, ${formatTimeRange(start, end)}`
  }

  return `${formatDateTime(start)} – ${formatDateTime(end)}`
}

// "2030-01-15T09:00" for a datetime-local input. The text is kept as it is,
// so times in the hour skipped or repeated by summer time stay unchanged.
export function toDateTimeLocalValue(value: string) {
  return value.slice(0, 16)
}

// "08:00" for a time input, from the API's "08:00:00" time of day.
export function toTimeOfDay(value: string) {
  return value.slice(0, 5)
}

// "2030-01-15" from "2030-01-15T09:00:00".
export function getDateKey(value: string) {
  return value.slice(0, 10)
}

const schedulingClockFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: schedulingTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

// An instant as wall-clock time in the scheduling time zone, such as
// "2030-01-15T09:00:00", in the same form as the API's times.
export function toSchedulingWallClock(instant: Date) {
  const parts = schedulingClockFormat.formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`
}

// Today's date in the scheduling time zone, as "2030-01-15", whatever the
// browser's own time zone is.
export function todayInSchedulingZone(now = new Date()) {
  return getDateKey(toSchedulingWallClock(now))
}

// "Tue 15 Jan 2030, 10:00" for a moment recorded by the API, such as when a
// booking was made. These are UTC instants with an offset, unlike booking
// times, and are shown in Copenhagen time.
export function formatInstant(value: string) {
  const instant = new Date(value)

  return Number.isNaN(instant.getTime()) ? value : formatDateTime(toSchedulingWallClock(instant))
}

// Adds calendar days to a "2030-01-15" date. Summer time can't shift the
// result, because the arithmetic is done in UTC.
export function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))

  return date.toISOString().slice(0, 10)
}
