import type { ResourceResponse } from '../../api/types'
import { addDays, toDateInputValue } from '../../lib/dates'

// The booking screen's selection, kept in the address so a reload or a shared
// link shows the same schedule: /book?resource=3&from=2030-01-14&to=2030-01-20
export interface BookingSelection {
  resourceId: number | null
  fromDate: string
  toDate: string
}

// Today and the six days after it.
export function defaultDateRange(now = new Date()) {
  return { fromDate: toDateInputValue(now), toDate: toDateInputValue(addDays(now, 6)) }
}

// Reads the selection from the address. Anything invalid is ignored rather than
// breaking the page: a resource that isn't a positive whole number, a date that
// doesn't exist, or a range that ends before it starts. Ignored dates fall back
// to the default range.
export function parseBookingSearch(search: string, now = new Date()): BookingSelection {
  const params = new URLSearchParams(search)
  const resource = params.get('resource')
  const fromDate = params.get('from')
  const toDate = params.get('to')
  const resourceId = resource && /^[1-9]\d{0,9}$/.test(resource) ? Number(resource) : null
  const hasValidRange =
    fromDate !== null && toDate !== null && isDate(fromDate) && isDate(toDate) && fromDate <= toDate

  return hasValidRange
    ? { resourceId, fromDate, toDate }
    : { resourceId, ...defaultDateRange(now) }
}

export function toBookingSearch(selection: BookingSelection) {
  const params = new URLSearchParams()

  if (selection.resourceId !== null) {
    params.set('resource', selection.resourceId.toString())
  }

  params.set('from', selection.fromDate)
  params.set('to', selection.toDate)

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
