import { describe, expect, it } from 'vitest'
import type { ResourceScheduleResponse } from '../api/types'
import { getSlotKey, groupScheduleByDay } from './schedule'

function schedule(
  bookableSlots: ResourceScheduleResponse['bookableSlots'],
  reservedSlots: ResourceScheduleResponse['reservedSlots'] = [],
): ResourceScheduleResponse {
  return {
    resourceId: 1,
    resourceName: 'Room',
    fromDate: '2030-01-14',
    toDate: '2030-01-16',
    bookableSlots,
    reservedSlots,
  }
}

describe('groupScheduleByDay', () => {
  it('groups slots by day, sorted by date and time', () => {
    const days = groupScheduleByDay(schedule([
      { startTime: '2030-01-15T13:00:00', endTime: '2030-01-15T14:00:00' },
      { startTime: '2030-01-14T08:00:00', endTime: '2030-01-14T09:00:00' },
      { startTime: '2030-01-15T08:00:00', endTime: '2030-01-15T09:00:00' },
    ]))

    expect(days.map((day) => day.date)).toEqual(['2030-01-14', '2030-01-15'])
    expect(days[1].bookableSlots.map((slot) => slot.startTime)).toEqual([
      '2030-01-15T08:00:00',
      '2030-01-15T13:00:00',
    ])
  })

  it('attaches reserved slots to their day', () => {
    const days = groupScheduleByDay(schedule(
      [{ startTime: '2030-01-15T08:00:00', endTime: '2030-01-15T09:00:00' }],
      [{ reservationId: 7, startTime: '2030-01-15T10:00:00', endTime: '2030-01-15T11:00:00' }],
    ))

    expect(days[0].reservedSlots).toHaveLength(1)
  })

  // Current behaviour, tracked as audit L3 for Milestone 5.
  it('leaves out days that have only reserved slots', () => {
    const days = groupScheduleByDay(schedule(
      [{ startTime: '2030-01-15T08:00:00', endTime: '2030-01-15T09:00:00' }],
      [{ reservationId: 7, startTime: '2030-01-16T10:00:00', endTime: '2030-01-16T11:00:00' }],
    ))

    expect(days.map((day) => day.date)).toEqual(['2030-01-15'])
  })
})

describe('getSlotKey', () => {
  it('identifies a slot by its start and end', () => {
    expect(getSlotKey({ startTime: '2030-01-15T08:00:00', endTime: '2030-01-15T09:00:00' }))
      .toBe('2030-01-15T08:00:00-2030-01-15T09:00:00')
  })
})
