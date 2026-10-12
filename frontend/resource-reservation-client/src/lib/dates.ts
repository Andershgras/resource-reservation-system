// Date helpers for the API's local wall-clock times, such as
// "2030-01-15T09:00:00", which carry no offset and are read as local time.

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

// "2030-01-15T09:00" for a datetime-local input.
export function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 16)
}

// "2030-01-15" for a date input, using the local date rather than the UTC date.
export function toDateInputValue(value: Date) {
  const offsetDate = new Date(value.getTime() - value.getTimezoneOffset() * 60000)

  return offsetDate.toISOString().slice(0, 10)
}

export function addDays(value: Date, days: number) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)

  return date
}

// "08:00" from the API's "08:00:00" time of day.
export function toTimeOfDay(value: string) {
  return value.slice(0, 5)
}

// "2030-01-15" from "2030-01-15T09:00:00".
export function getDateKey(value: string) {
  return value.slice(0, 10)
}

export function formatDateHeading(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatClockTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}
