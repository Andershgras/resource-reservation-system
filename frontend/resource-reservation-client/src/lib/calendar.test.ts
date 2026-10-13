import { describe, expect, it } from 'vitest'
import type { ResourceScheduleResponse } from '../api/types'
import {
  buildCalendarWeek,
  defaultEndTime,
  endOptions,
  formatDuration,
  fromWallClockMinutes,
  isWithinInterval,
  startOfWeek,
  startOptions,
  toWallClockMinutes,
  visibleHours,
  weekDates,
} from './calendar'

function schedule(
  bookableSlots: [string, string][],
  reservedSlots: [string, string][] = [],
): ResourceScheduleResponse {
  return {
    resourceId: 1,
    resourceName: 'Room A',
    fromDate: '2030-01-14',
    toDate: '2030-01-20',
    bookableSlots: bookableSlots.map(([startTime, endTime]) => ({ startTime, endTime })),
    reservedSlots: reservedSlots.map(([startTime, endTime]) => ({ startTime, endTime })),
  }
}

const labels = (options: { label: string }[]) => options.map((option) => option.label)

describe('weeks', () => {
  it.each([
    ['2030-01-14', '2030-01-14'], // Monday
    ['2030-01-16', '2030-01-14'],
    ['2030-01-20', '2030-01-14'], // Sunday
    ['2030-01-01', '2029-12-31'], // across a year
    ['2030-03-31', '2030-03-25'], // summer time starts
    ['2030-10-27', '2030-10-21'], // summer time ends
  ])('starts the week of %s on Monday %s', (date, monday) => {
    expect(startOfWeek(date)).toBe(monday)
  })

  it('has seven calendar days, also across the summer-time switch', () => {
    expect(weekDates('2030-03-25')).toEqual([
      '2030-03-25', '2030-03-26', '2030-03-27', '2030-03-28', '2030-03-29', '2030-03-30', '2030-03-31',
    ])
  })
})

describe('wall-clock minutes', () => {
  it('round-trips an API time', () => {
    expect(fromWallClockMinutes(toWallClockMinutes('2030-01-15T09:05:00'))).toBe('2030-01-15T09:05:00')
  })

  it('ignores summer time: 01:30 to 03:30 on 31 March is two hours on the wall clock', () => {
    expect(toWallClockMinutes('2030-03-31T03:30:00') - toWallClockMinutes('2030-03-31T01:30:00')).toBe(120)
  })

  it('cannot read other text', () => {
    expect(toWallClockMinutes('soon')).toBeNaN()
  })
})

describe('buildCalendarWeek', () => {
  const week = '2030-01-14'
  const today = '2030-01-14'

  it('shows every day of the week, in order', () => {
    const days = buildCalendarWeek(schedule([]), week, today)

    expect(days.map((day) => day.date)).toEqual(weekDates(week))
    expect(days.map((day) => day.label)[0]).toBe('Mon 14 Jan')
  })

  it('puts free and reserved time in order, at their exact minutes', () => {
    const [, tuesday] = buildCalendarWeek(
      schedule(
        [['2030-01-15T08:00:00', '2030-01-15T10:07:00'], ['2030-01-15T11:23:00', '2030-01-15T16:00:00']],
        [['2030-01-15T10:07:00', '2030-01-15T11:23:00']],
      ),
      week,
      today,
    )

    expect(tuesday.status).toBe('open')
    expect(tuesday.segments.map((segment) => [segment.kind, segment.startMinute, segment.endMinute])).toEqual([
      ['available', 8 * 60, 10 * 60 + 7],
      ['reserved', 10 * 60 + 7, 11 * 60 + 23],
      ['available', 11 * 60 + 23, 16 * 60],
    ])
  })

  // Audit L3: fully booked days used to disappear.
  it('keeps a fully booked day, with its reservations', () => {
    const [, tuesday] = buildCalendarWeek(
      schedule([], [['2030-01-15T08:00:00', '2030-01-15T16:00:00']]),
      week,
      today,
    )

    expect(tuesday.status).toBe('fullyBooked')
    expect(tuesday.segments).toHaveLength(1)
  })

  it('tells a day without opening hours from a day that has passed', () => {
    const days = buildCalendarWeek(
      schedule([], [['2030-01-14T09:00:00', '2030-01-14T10:00:00']]),
      week,
      '2030-01-16',
    )

    expect(days.map((day) => day.status)).toEqual([
      'past', 'past', 'closed', 'closed', 'closed', 'closed', 'closed',
    ])
  })

  it('splits a period that crosses midnight into one piece per day', () => {
    const days = buildCalendarWeek(schedule([['2030-01-15T22:00:00', '2030-01-16T02:00:00']]), week, today)

    expect(days[1].segments.map((segment) => [segment.startMinute, segment.endMinute])).toEqual([[22 * 60, 24 * 60]])
    expect(days[2].segments.map((segment) => [segment.startMinute, segment.endMinute])).toEqual([[0, 2 * 60]])
    // Both pieces book inside the whole period.
    expect(days[2].segments[0].interval).toEqual({
      startTime: '2030-01-15T22:00:00',
      endTime: '2030-01-16T02:00:00',
    })
  })

  it('leaves out periods that cannot be read or end before they start', () => {
    const days = buildCalendarWeek(
      schedule([['2030-01-15T10:00:00', '2030-01-15T09:00:00'], ['nonsense', '2030-01-15T09:00:00']]),
      week,
      today,
    )

    expect(days[1].segments).toEqual([])
    expect(days[1].status).toBe('closed')
  })

  it('handles no schedule at all', () => {
    expect(buildCalendarWeek(null, week, today).every((day) => day.status === 'closed')).toBe(true)
  })

  it.each([
    ['summer time starts', '2030-03-25', '2030-03-31'],
    ['summer time ends', '2030-10-21', '2030-10-27'],
  ])('places opening hours by the wall clock on the day %s', (_, weekStart, sunday) => {
    const days = buildCalendarWeek(
      schedule([[`${sunday}T01:00:00`, `${sunday}T04:00:00`]]),
      weekStart,
      weekStart,
    )
    const [segment] = days[6].segments

    expect(days[6].date).toBe(sunday)
    expect([segment.startMinute, segment.endMinute]).toEqual([60, 240])
  })
})

describe('visibleHours', () => {
  it('spans the earliest start to the latest end, in whole hours', () => {
    const days = buildCalendarWeek(
      schedule([['2030-01-15T07:30:00', '2030-01-15T12:00:00'], ['2030-01-16T09:00:00', '2030-01-16T18:10:00']]),
      '2030-01-14',
      '2030-01-14',
    )

    expect(visibleHours(days)).toEqual({ firstHour: 7, lastHour: 19 })
  })

  it('shows office hours for an empty week', () => {
    expect(visibleHours(buildCalendarWeek(null, '2030-01-14', '2030-01-14'))).toEqual({ firstHour: 8, lastHour: 17 })
  })
})

describe('time options', () => {
  const morning = { startTime: '2030-01-15T09:00:00', endTime: '2030-01-15T10:00:00' }

  it('offers quarter hours inside the period', () => {
    expect(labels(startOptions(morning))).toEqual(['09:00', '09:15', '09:30', '09:45'])
    expect(labels(endOptions(morning, '2030-01-15T09:00:00'))).toEqual(['09:15', '09:30', '09:45', '10:00'])
    expect(labels(endOptions(morning, '2030-01-15T09:45:00'))).toEqual(['10:00'])
  })

  it('also offers the exact edges of a period that is off the quarter-hour grid', () => {
    const gap = { startTime: '2030-01-15T10:07:00', endTime: '2030-01-15T11:23:00' }

    expect(labels(startOptions(gap))).toEqual(['10:07', '10:15', '10:30', '10:45', '11:00', '11:15'])
    expect(labels(endOptions(gap, '2030-01-15T10:07:00'))).toEqual(['10:15', '10:30', '10:45', '11:00', '11:15', '11:23'])
    expect(labels(endOptions(gap, '2030-01-15T11:15:00'))).toEqual(['11:23'])
  })

  it('offers a period shorter than 15 minutes whole', () => {
    const short = { startTime: '2030-01-15T09:50:00', endTime: '2030-01-15T09:58:00' }

    expect(labels(startOptions(short))).toEqual(['09:50'])
    expect(labels(endOptions(short, short.startTime))).toEqual(['09:58'])
  })

  it('names the next day for times after midnight', () => {
    const night = { startTime: '2030-01-15T23:30:00', endTime: '2030-01-16T00:30:00' }

    expect(labels(startOptions(night))).toEqual(['23:30', '23:45', 'Wed 16 Jan, 00:00', 'Wed 16 Jan, 00:15'])
    expect(labels(endOptions(night, night.startTime))).toEqual(['23:45', 'Wed 16 Jan, 00:00', 'Wed 16 Jan, 00:15', 'Wed 16 Jan, 00:30'])
  })

  it('counts wall-clock quarter hours across the hour summer time skips', () => {
    const night = { startTime: '2030-03-31T01:30:00', endTime: '2030-03-31T03:30:00' }

    expect(labels(startOptions(night))).toEqual(['01:30', '01:45', '02:00', '02:15', '02:30', '02:45', '03:00', '03:15'])
  })

  it('offers nothing for a period that ends before it starts', () => {
    expect(startOptions({ startTime: '2030-01-15T10:00:00', endTime: '2030-01-15T09:00:00' })).toEqual([])
  })

  it('suggests an hour, or the whole period when it is shorter', () => {
    const day = { startTime: '2030-01-15T08:00:00', endTime: '2030-01-15T16:00:00' }

    expect(defaultEndTime(day, '2030-01-15T08:00:00')).toBe('2030-01-15T09:00:00')
    expect(defaultEndTime(day, '2030-01-15T15:30:00')).toBe('2030-01-15T16:00:00')
    expect(defaultEndTime({ startTime: '2030-01-15T10:07:00', endTime: '2030-01-15T10:20:00' }, '2030-01-15T10:07:00'))
      .toBe('2030-01-15T10:20:00')
  })

  it('checks a choice stays inside the period', () => {
    expect(isWithinInterval(morning, '2030-01-15T09:00:00', '2030-01-15T10:00:00')).toBe(true)
    expect(isWithinInterval(morning, '2030-01-15T08:45:00', '2030-01-15T09:30:00')).toBe(false)
    expect(isWithinInterval(morning, '2030-01-15T09:30:00', '2030-01-15T10:15:00')).toBe(false)
    expect(isWithinInterval(morning, '2030-01-15T09:30:00', '2030-01-15T09:30:00')).toBe(false)
  })
})

describe('formatDuration', () => {
  it.each([
    ['2030-01-15T09:00:00', '2030-01-15T09:45:00', '45 min'],
    ['2030-01-15T09:00:00', '2030-01-15T10:00:00', '1 h'],
    ['2030-01-15T09:00:00', '2030-01-15T10:30:00', '1 h 30 min'],
    ['2030-01-15T23:00:00', '2030-01-16T00:15:00', '1 h 15 min'],
    ['2030-01-15T10:00:00', '2030-01-15T10:00:00', ''],
  ])('%s to %s is %j', (start, end, expected) => {
    expect(formatDuration(start, end)).toBe(expected)
  })
})
