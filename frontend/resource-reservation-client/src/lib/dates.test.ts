import { describe, expect, it } from 'vitest'
import {
  isNonexistentWallClock,
  addDaysToDateKey,
  formatDate,
  formatDateHeading,
  formatDateTime,
  formatDateTimeRange,
  formatTime,
  formatTimeRange,
  getDateKey,
  toDateTimeLocalValue,
  todayInSchedulingZone,
  toSchedulingWallClock,
  formatInstant,
  toTimeOfDay,
} from './dates'

// The tests run in Europe/Copenhagen (see vite.config.ts). Summer time starts
// on 31 March 2030 at 02:00 and ends on 27 October 2030 at 03:00.
describe('isNonexistentWallClock', () => {
  it.each([
    ['2030-03-31T02:00:00', true],
    ['2030-03-31T02:30', true],
    ['2030-03-31T02:59:00', true],
    ['2030-03-31T01:59:00', false],
    ['2030-03-31T03:00:00', false],
    // The repeated autumn hour happens, twice.
    ['2030-10-27T02:30:00', false],
    ['2030-01-15T02:30:00', false],
    ['not a time', false],
  ])('%s never happens: %s', (value, expected) => {
    expect(isNonexistentWallClock(value)).toBe(expected)
  })
})

describe('formatting', () => {
  it('formats a date in en-GB order with a short weekday and month', () => {
    expect(formatDate('2030-01-15')).toBe('Tue 15 Jan 2030')
    expect(formatDate('2030-01-15T09:00:00')).toBe('Tue 15 Jan 2030')
    expect(formatDateHeading('2030-01-15')).toBe('Tue 15 Jan')
  })

  it('uses a 24-hour clock', () => {
    expect(formatDateTime('2030-01-15T09:05:00')).toBe('Tue 15 Jan 2030, 09:05')
    expect(formatDateTime('2030-01-15T21:30:00')).toBe('Tue 15 Jan 2030, 21:30')
    expect(formatTime('2030-01-15T00:00:00')).toBe('00:00')
  })

  it('formats an API time of day', () => {
    expect(formatTime('08:00:00')).toBe('08:00')
    expect(formatTimeRange('08:00:00', '16:30:00')).toBe('08:00–16:30')
  })

  it('shows the date once for a range within one day', () => {
    expect(formatDateTimeRange('2030-01-15T09:00:00', '2030-01-15T11:15:00'))
      .toBe('Tue 15 Jan 2030, 09:00–11:15')
  })

  it('shows both dates for a range that crosses midnight', () => {
    expect(formatDateTimeRange('2030-01-15T22:00:00', '2030-01-16T00:00:00'))
      .toBe('Tue 15 Jan 2030, 22:00 – Wed 16 Jan 2030, 00:00')
  })

  it('keeps the wall-clock time on both summer-time switches', () => {
    // 02:30 doesn't exist on 31 March and occurs twice on 27 October. The
    // API's text is shown as it is, never moved by an hour.
    expect(formatDateTime('2030-03-31T02:30:00')).toBe('Sun 31 Mar 2030, 02:30')
    expect(formatDateTime('2030-03-31T03:00:00')).toBe('Sun 31 Mar 2030, 03:00')
    expect(formatDateTime('2030-10-27T02:30:00')).toBe('Sun 27 Oct 2030, 02:30')
  })

  it('shows text it cannot read unchanged rather than "Invalid Date"', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
    expect(formatTime('')).toBe('')
  })
})

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

describe('todayInSchedulingZone', () => {
  it('uses the Copenhagen date, not the UTC date', () => {
    // 23:30 UTC on 14 January is already 00:30 on 15 January in Copenhagen.
    expect(todayInSchedulingZone(new Date('2030-01-14T23:30:00Z'))).toBe('2030-01-15')
    // 22:30 UTC on 14 July is 00:30 on 15 July in Copenhagen summer time.
    expect(todayInSchedulingZone(new Date('2030-07-14T22:30:00Z'))).toBe('2030-07-15')
    expect(todayInSchedulingZone(new Date('2030-07-14T21:30:00Z'))).toBe('2030-07-14')
  })
})

describe('addDaysToDateKey', () => {
  it('adds calendar days across both summer-time switches', () => {
    expect(addDaysToDateKey('2030-03-30', 1)).toBe('2030-03-31')
    expect(addDaysToDateKey('2030-03-31', 1)).toBe('2030-04-01')
    expect(addDaysToDateKey('2030-10-26', 2)).toBe('2030-10-28')
  })

  it('crosses month and year ends, and goes backwards', () => {
    expect(addDaysToDateKey('2030-12-29', 6)).toBe('2031-01-04')
    expect(addDaysToDateKey('2032-03-01', -1)).toBe('2032-02-29')
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

describe('toSchedulingWallClock', () => {
  it('gives the Copenhagen wall-clock time, with midnight as 00', () => {
    expect(toSchedulingWallClock(new Date('2030-01-14T23:00:00Z'))).toBe('2030-01-15T00:00:00')
    expect(toSchedulingWallClock(new Date('2030-07-15T07:05:09Z'))).toBe('2030-07-15T09:05:09')
  })
})

describe('formatInstant', () => {
  it('shows a recorded UTC moment in Copenhagen time', () => {
    expect(formatInstant('2030-01-15T09:00:00+00:00')).toBe('Tue 15 Jan 2030, 10:00')
    expect(formatInstant('2030-07-15T09:00:00.1234567+00:00')).toBe('Mon 15 Jul 2030, 11:00')
  })

  it('leaves text that is not a time unchanged', () => {
    expect(formatInstant('soon')).toBe('soon')
  })
})
