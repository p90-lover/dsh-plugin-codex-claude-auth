import { describe, expect, it, vi } from 'vitest'
import type { HarnessOAuthCredentialStore } from '../src/credential-store.ts'
import {
  DEFAULT_OPENAI_CONTEXT_WINDOW,
  MAX_OPENAI_CONTEXT_WINDOW,
  MIN_OPENAI_CONTEXT_WINDOW,
  OPENAI_CONTEXT_WINDOW_OPTIONS,
  OpenAIContextWindowPreference,
} from '../src/context-window.ts'

function fakeStore(stored?: number): {
  store: HarnessOAuthCredentialStore
  setContextWindow: ReturnType<typeof vi.fn>
} {
  const setContextWindow = vi.fn(async () => undefined)
  return {
    store: {
      contextWindow: vi.fn(async () => stored),
      setContextWindow,
    } as unknown as HarnessOAuthCredentialStore,
    setContextWindow,
  }
}

describe('OpenAIContextWindowPreference', () => {
  it('offers 252K, 353K, 500K and 1M with a custom range', () => {
    const preference = new OpenAIContextWindowPreference(fakeStore().store)
    expect(preference.status()).toEqual({
      selected: DEFAULT_OPENAI_CONTEXT_WINDOW,
      options: [...OPENAI_CONTEXT_WINDOW_OPTIONS],
      minimum: MIN_OPENAI_CONTEXT_WINDOW,
      maximum: MAX_OPENAI_CONTEXT_WINDOW,
      autoCompactAt: Math.floor(DEFAULT_OPENAI_CONTEXT_WINDOW * 0.9),
    })
  })

  it('loads and persists a custom value inside the supported range', async () => {
    const fake = fakeStore(777_000)
    const preference = new OpenAIContextWindowPreference(fake.store)
    await preference.load()
    expect(preference.status().selected).toBe(777_000)
    expect(preference.status().autoCompactAt).toBe(699_300)

    await preference.set(1_000_000)
    expect(fake.setContextWindow).toHaveBeenCalledWith('openai-codex', 1_000_000)
    expect(preference.status().selected).toBe(1_000_000)
  })

  it('rejects custom values outside 252K through 1M', async () => {
    const preference = new OpenAIContextWindowPreference(fakeStore().store)
    await expect(preference.set(251_999)).rejects.toThrow(/252000/u)
    await expect(preference.set(1_000_001)).rejects.toThrow(/1000000/u)
  })
})
