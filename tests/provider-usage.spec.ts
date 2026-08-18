import { describe, expect, it } from 'vitest'
import {
  contextControlValue,
  formatContextWindow,
  latestProviderFromNodes,
  providerIdFromRoute,
  remainingPercent,
} from '../src/client/provider-usage.ts'

describe('provider usage helpers', () => {
  it('maps only the active OAuth route to its composer provider', () => {
    expect(providerIdFromRoute('openai-codex-oauth')).toBe('codex')
    expect(providerIdFromRoute('anthropic-oauth')).toBe('claude')
    expect(providerIdFromRoute('other-provider')).toBeUndefined()
  })

  it('uses the latest assistant provenance when the model directory has not loaded yet', () => {
    expect(latestProviderFromNodes([
      { kind: 'assistant', provenance: { provider: 'openai-codex-oauth' } },
      { kind: 'user' },
      { kind: 'assistant', provenance: { provider: 'anthropic-oauth' } },
    ])).toBe('claude')
  })

  it('shows remaining capacity from 100 percent down to zero', () => {
    expect(remainingPercent(undefined, 0)).toBe(100)
    expect(remainingPercent(73.6, 26.4)).toBe(74)
    expect(remainingPercent(undefined, 100)).toBe(0)
    expect(remainingPercent(140, undefined)).toBe(100)
  })

  it('formats extended context presets without showing 1000K', () => {
    expect(formatContextWindow(252_000)).toBe('252K')
    expect(formatContextWindow(500_000)).toBe('500K')
    expect(formatContextWindow(1_000_000)).toBe('1M')
  })

  it('keeps the custom editor visible after Custom is selected from a preset', () => {
    const options = [252_000, 353_000, 500_000, 1_000_000]
    expect(contextControlValue(252_000, options, false)).toBe('252000')
    expect(contextControlValue(252_000, options, true)).toBe('custom')
    expect(contextControlValue(777_000, options, false)).toBe('custom')
  })
})
