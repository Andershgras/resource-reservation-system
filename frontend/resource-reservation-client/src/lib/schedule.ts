import type { BookableSlotResponse, ResourceScheduleResponse } from '../api/types'
import { formatDateHeading, getDateKey } from './dates'

export function getSlotKey(slot: BookableSlotResponse) {
  return `${slot.startTime}-${slot.endTime}`
}

// Groups bookable and reserved slots by day, sorted by time. Days with no
// bookable slots are left out, including their reserved slots (audit L3).
export function groupScheduleByDay(resourceSchedule: ResourceScheduleResponse) {
  const slotsByDate = new Map<string, BookableSlotResponse[]>()
  const reservedSlotsByDate = new Map<string, ResourceScheduleResponse['reservedSlots']>()

  for (const slot of resourceSchedule.bookableSlots) {
    const date = getDateKey(slot.startTime)
    slotsByDate.set(date, [...(slotsByDate.get(date) ?? []), slot])
  }

  for (const slot of resourceSchedule.reservedSlots) {
    const date = getDateKey(slot.startTime)
    reservedSlotsByDate.set(date, [...(reservedSlotsByDate.get(date) ?? []), slot])
  }

  return [...slotsByDate.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([date, slots]) => ({
      date,
      label: formatDateHeading(date),
      bookableSlots: slots.sort((firstSlot, secondSlot) =>
        firstSlot.startTime.localeCompare(secondSlot.startTime),
      ),
      reservedSlots: (reservedSlotsByDate.get(date) ?? []).sort(
        (firstSlot, secondSlot) =>
          firstSlot.startTime.localeCompare(secondSlot.startTime),
      ),
    }))
}
