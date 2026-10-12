import { describe, expect, it } from 'vitest'
import type { ResourceResponse } from '../../api/types'
import { bookingSelectionFor, defaultDateRange, parseBookingSearch, toBookingSearch } from './bookingSearch'

const now = new Date(2030, 0, 14, 10, 0)
const defaults = defaultDateRange(now)

describe('defaultDateRange', () => {
  it('covers today and the next six days', () => {
    expect(defaults).toEqual({ fromDate: '2030-01-14', toDate: '2030-01-20' })
  })
})

describe('parseBookingSearch', () => {
  it('reads a complete selection', () => {
    expect(parseBookingSearch('?resource=3&from=2030-01-15&to=2030-01-17', now)).toEqual({
      resourceId: 3,
      fromDate: '2030-01-15',
      toDate: '2030-01-17',
    })
  })

  it('uses the defaults when there is no selection', () => {
    expect(parseBookingSearch('', now)).toEqual({ resourceId: null, ...defaults })
  })

  it.each([['abc'], ['0'], ['-3'], ['1.5'], ['12345678901']])('ignores the resource %j', (resource) => {
    expect(parseBookingSearch(`?resource=${resource}&from=2030-01-15&to=2030-01-15`, now).resourceId)
      .toBeNull()
  })

  it.each([
    ['2030-02-30', '2030-03-01'],
    ['2030-1-15', '2030-01-16'],
    ['nonsense', '2030-01-16'],
    ['2030-01-17', '2030-01-15'],
    ['2030-01-15', ''],
  ])('falls back to the default range for %j to %j', (from, to) => {
    expect(parseBookingSearch(`?resource=3&from=${from}&to=${to}`, now)).toEqual({
      resourceId: 3,
      ...defaults,
    })
  })

  it('accepts a single day', () => {
    expect(parseBookingSearch('?from=2030-01-15&to=2030-01-15', now).toDate).toBe('2030-01-15')
  })

  it('accepts 29 February in a leap year', () => {
    expect(parseBookingSearch('?from=2032-02-29&to=2032-03-01', now).fromDate).toBe('2032-02-29')
  })
})

describe('toBookingSearch', () => {
  it('writes the selection back in the same form', () => {
    const search = toBookingSearch({ resourceId: 3, fromDate: '2030-01-15', toDate: '2030-01-17' })

    expect(search).toBe('?resource=3&from=2030-01-15&to=2030-01-17')
    expect(parseBookingSearch(search, now)).toEqual({ resourceId: 3, fromDate: '2030-01-15', toDate: '2030-01-17' })
  })
})

describe('bookingSelectionFor', () => {
  const resources: ResourceResponse[] = [
    { id: 1, name: 'Open', description: null, location: null, isActive: true },
    { id: 2, name: 'Closed', description: null, location: null, isActive: false },
  ]

  it('keeps an active resource', () => {
    expect(bookingSelectionFor('?resource=1', resources).resourceId).toBe(1)
  })

  it.each([
    ['an inactive resource', '?resource=2', resources],
    ['an unknown resource', '?resource=9', resources],
    ['a resource while the list is loading', '?resource=1', undefined],
  ])('drops %s', (_, search, list) => {
    expect(bookingSelectionFor(search, list).resourceId).toBeNull()
  })
})
