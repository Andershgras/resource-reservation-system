import { describe, expect, it } from 'vitest'
import {
  addDays,
  getDateKey,
  toDateInputValue,
  toDateTimeLocalValue,
  toTimeOfDay,
} from './dates'

// The tests run in Europe/Copenhagen (see vite.config.ts). Summer time starts
// on 31 March 2030 at 02:00 and ends on 27 October 2030 at 03:00.
describe('toDateTimeLocalValue', () => {
  it('keeps the wall-clock time of an API time', () => {
    expect(toDateTimeLocalValue('2030-01-15T09:00:00')).toBe('2030-01-15T09:00')
  })

  it('keeps the wall-clock time during summer time', () => {
    expect(toDateTimeLocalValue('2030-07-15T09:30:00')).toBe('2030-07-15T09:30')
  })

  it('keeps the wall-clock time just after summer time starts', () => {
    expect(toDateTimeLocalValue('2030-03-31T03:00:00')).toBe('2030-03-31T03:00')
  })

  it('keeps a time in the repeated hour when summer time ends', () => {
    expect(toDateTimeLocalValue('2030-10-27T02:30:00')).toBe('2030-10-27T02:30')
  })
})

describe('toDateInputValue', () => {
  it('uses the local date, not the UTC date', () => {
    // 00:30 on 1 January in Copenhagen is still 31 December in UTC.
    expect(toDateInputValue(new Date(2030, 0, 1, 0, 30))).toBe('2030-01-01')
    expect(toDateInputValue(new Date(2030, 0, 15, 23, 30))).toBe('2030-01-15')
  })
})

describe('addDays', () => {
  it('adds calendar days across the start of summer time', () => {
    const result = addDays(new Date(2030, 2, 30, 12, 0), 1)

    expect(result).toEqual(new Date(2030, 2, 31, 12, 0))
  })

  it('does not change the date it is given', () => {
    const start = new Date(2030, 0, 15)

    addDays(start, 6)

    expect(start).toEqual(new Date(2030, 0, 15))
  })
})

describe('toTimeOfDay', () => {
  it('drops the seconds from an API time of day', () => {
    expect(toTimeOfDay('08:00:00')).toBe('08:00')
  })
})

describe('getDateKey', () => {
  it('returns the date part of an API time', () => {
    expect(getDateKey('2030-01-15T09:00:00')).toBe('2030-01-15')
  })
})
