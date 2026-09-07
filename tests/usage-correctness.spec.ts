import { describe, expect, it } from 'vitest'
import { claudeUsage } from '../src/account-usage.ts'
import { remainingPercent } from '../src/client/provider-usage.ts'
describe('truthful quota display', () => {
  it('does not display unknown quota as a fresh 100 percent', () => {
    expect(remainingPercent(undefined, undefined)).toBeUndefined()
  })
  it('treats Claude utilization 1 as one percent, not exhaustion', () => {
    expect(claudeUsage({ five_hour: { utilization: 1 } }).remainingPercent).toBe(99)
  })
  it('preserves fractional utilization without guessing ratio units', () => {
    expect(claudeUsage({ five_hour: { utilization: 0.5 } }).remainingPercent).toBe(99.5)
  })
})
