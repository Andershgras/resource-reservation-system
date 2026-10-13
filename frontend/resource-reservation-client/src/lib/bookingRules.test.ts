import { describe, expect, it } from 'vitest'
import { noRuleOverrides, testPolicy } from '../test/fixtures'
import {
  describeBookingRules,
  describeRuleOverrides,
  toBookingRuleOverrides,
  toBookingRulesDraft,
} from './bookingRules'

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

describe('booking rule drafts', () => {
  it('turn overrides into form values and back, with empty meaning the default', () => {
    const overrides = { minDurationMinutes: null, maxDurationMinutes: 60, minLeadTimeMinutes: 0, maxAdvanceDays: null }
    const draft = toBookingRulesDraft(overrides)

    expect(draft).toEqual({ minDurationMinutes: '', maxDurationMinutes: '60', minLeadTimeMinutes: '0', maxAdvanceDays: '' })
    expect(toBookingRuleOverrides({ ...draft, maxAdvanceDays: ' ' })).toEqual(overrides)
  })
})

describe('describeRuleOverrides', () => {
  it('lists only the rules a resource sets itself', () => {
    expect(describeRuleOverrides({
      minDurationMinutes: 30,
      maxDurationMinutes: 60,
      minLeadTimeMinutes: 120,
      maxAdvanceDays: 14,
    })).toBe('At least 30 min, at most 1 h, 2 h notice, up to 14 days ahead')
    expect(describeRuleOverrides({ ...noRuleOverrides, minLeadTimeMinutes: 0 })).toBe('No notice')
    expect(describeRuleOverrides(noRuleOverrides)).toBeNull()
  })
})
