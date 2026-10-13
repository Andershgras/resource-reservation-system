import type { ResourceResponse } from '../../api/types'
import { startOfWeek } from '../../lib/calendar'
import { addDaysToDateKey, todayInSchedulingZone } from '../../lib/dates'

// The booking screen's selection, kept in the address so a reload or a shared
// link shows the same week: /book?resource=3&week=2030-01-14. Moving a
// booking adds its ID: /book?resource=3&week=2030-01-14&move=42
export interface BookingSelection {
  resourceId: number | null
  // The Monday the shown week starts on.
  weekStart: string
  // The booking being moved to a new time, if any.
  moveReservationId: number | null
}

// The week that contains today, in the scheduling time zone.
export function currentWeekStart(now = new Date()) {
  return startOfWeek(todayInSchedulingZone(now))
}

// The dates the schedule is loaded for: Monday to Sunday.
export function weekRange(weekStart: string) {
  return { fromDate: weekStart, toDate: addDaysToDateKey(weekStart, 6) }
}

// Reads the selection from the address. Anything invalid is ignored rather than
// breaking the page: a resource that isn't a positive whole number, or a date
// that doesn't exist, which falls back to this week. Any date selects the week
// it is in. Links from before the calendar, with ?from=…&to=…, open the week
// of their from date.
export function parseBookingSearch(search: string, now = new Date()): BookingSelection {
  const params = new URLSearchParams(search)
  const date = [params.get('week'), params.get('from')].find(
    (value): value is string => value !== null && isDate(value),
  )

  return {
    resourceId: parseId(params.get('resource')),
    weekStart: date ? startOfWeek(date) : currentWeekStart(now),
    moveReservationId: parseId(params.get('move')),
  }
}

// A positive whole number, or null.
function parseId(value: string | null) {
  return value && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null
}

export function toBookingSearch(selection: BookingSelection) {
  const params = new URLSearchParams()

  if (selection.resourceId !== null) {
    params.set('resource', selection.resourceId.toString())
  }

  params.set('week', selection.weekStart)

  if (selection.moveReservationId !== null) {
    params.set('move', selection.moveReservationId.toString())
  }

  return `?${params.toString()}`
}

// A real calendar date in YYYY-MM-DD form, so 2030-02-30 is rejected.
function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00Z`)

  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

// The selection from the address. A resource is only used once the resource
// list confirms it exists and is active, so a stale or edited link shows the
// resource list instead of an error.
export function bookingSelectionFor(search: string, resources: ResourceResponse[] | undefined) {
  const selection = parseBookingSearch(search)
  const isBookable = resources?.some(
    (resource) => resource.id === selection.resourceId && resource.isActive,
  )

  return isBookable ? selection : { ...selection, resourceId: null }
}
