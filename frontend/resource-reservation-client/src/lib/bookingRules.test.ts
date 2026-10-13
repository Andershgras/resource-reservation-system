import { describe, expect, it } from 'vitest'
import { testPolicy } from '../test/fixtures'
import { describeBookingRules } from './bookingRules'

describe('describeBookingRules', () => {
  it('describes the default rules', () => {
    expect(describeBookingRules(testPolicy)).toBe(
      'Bookings last 15 min to 8 h and can be made up to 90 days ahead. You can have up to 5 upcoming bookings.',
    )
  })

  it('mentions the notice period when there is one', () => {
    expect(describeBookingRules({ ...testPolicy, minLeadTimeMinutes: 120, maxAdvanceDays: 1 })).toBe(
      'Bookings last 15 min to 8 h, at least 2 h in advance and up to 1 day ahead. ' +
        'You can have up to 5 upcoming bookings.',
    )
  })
})
