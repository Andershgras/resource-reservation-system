import { describe, expect, it } from 'vitest'
import type { ResourceResponse } from '../../api/types'
import {
  bookingSelectionFor,
  currentWeekStart,
  parseBookingSearch,
  toBookingSearch,
  weekRange,
} from './bookingSearch'

// Wednesday 16 January 2030, 10:00 in Copenhagen.
const now = new Date('2030-01-16T09:00:00Z')

describe('currentWeekStart', () => {
  it('is the Monday of this week', () => {
    expect(currentWeekStart(now)).toBe('2030-01-14')
  })

  it('uses the Copenhagen date: late on Sunday in UTC is already next week there', () => {
    // 23:30 UTC on Sunday 20 January is 00:30 on Monday 21 January in Copenhagen.
    expect(currentWeekStart(new Date('2030-01-20T23:30:00Z'))).toBe('2030-01-21')
  })
})

describe('weekRange', () => {
  it('runs from Monday to Sunday, across a month end', () => {
    expect(weekRange('2030-01-28')).toEqual({ fromDate: '2030-01-28', toDate: '2030-02-03' })
  })
})

describe('parseBookingSearch', () => {
  it('reads a resource and week', () => {
    expect(parseBookingSearch('?resource=3&week=2030-01-21', now)).toEqual({
      resourceId: 3,
      weekStart: '2030-01-21',
    })
  })

  it('moves any date to the Monday of its week', () => {
    expect(parseBookingSearch('?week=2030-01-24', now).weekStart).toBe('2030-01-21')
  })

  it('opens the week of an old from=…&to=… link', () => {
    expect(parseBookingSearch('?resource=3&from=2030-01-15&to=2030-01-17', now)).toEqual({
      resourceId: 3,
      weekStart: '2030-01-14',
    })
  })

  it('uses this week when there is no selection', () => {
    expect(parseBookingSearch('', now)).toEqual({ resourceId: null, weekStart: '2030-01-14' })
  })

  it.each([['abc'], ['0'], ['-3'], ['1.5'], ['12345678901']])('ignores the resource %j', (resource) => {
    expect(parseBookingSearch(`?resource=${resource}&week=2030-01-14`, now).resourceId).toBeNull()
  })

  it.each([['2030-02-30'], ['2030-1-15'], ['nonsense'], ['']])('falls back to this week for %j', (week) => {
    expect(parseBookingSearch(`?resource=3&week=${week}`, now)).toEqual({
      resourceId: 3,
      weekStart: '2030-01-14',
    })
  })

  it('accepts 29 February in a leap year', () => {
    expect(parseBookingSearch('?week=2032-02-29', now).weekStart).toBe('2032-02-23')
  })
})

describe('toBookingSearch', () => {
  it('writes the selection back in the same form', () => {
    const search = toBookingSearch({ resourceId: 3, weekStart: '2030-01-21' })

    expect(search).toBe('?resource=3&week=2030-01-21')
    expect(parseBookingSearch(search, now)).toEqual({ resourceId: 3, weekStart: '2030-01-21' })
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
