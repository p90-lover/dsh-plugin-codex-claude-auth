import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

function read(path) {
  return readFileSync(path, 'utf8')
}

function write(path, content) {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true })
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
}

function replaceOnce(path, before, after) {
  const source = read(path)
  const count = source.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one replacement, found ${count}`)
  writeFileSync(path, source.replace(before, after), 'utf8')
}

write('tests/context-window.spec.ts', `import { describe, expect, it, vi } from 'vitest'
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
`)

write('tests/provider-usage.spec.ts', `import { describe, expect, it } from 'vitest'
import {
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
})
`)

write('tests/failover-effort.spec.ts', `import { describe, expect, it } from 'vitest'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import {
  AutoFailoverAdapter,
  FailoverPreferences,
  type FailoverRuntime,
} from '../src/failover.ts'
import type { HarnessCredentialBackend } from '../src/credential-store.ts'

class MemoryBackend implements HarnessCredentialBackend {
  readonly values = new Map<string, string>()
  async resolve(ref: string) {
    const value = this.values.get(ref)
    return value === undefined ? undefined : { value, source: 'memory' }
  }
  async describe(ref: string) {
    return { configured: this.values.has(ref), source: 'memory' }
  }
  async set(ref: string, value: string) { this.values.set(ref, value) }
  async unset(ref: string) { this.values.delete(ref) }
}

class SourceAdapter extends LlmAdapter {
  override providerInfo(provider: string) { return { id: provider, name: 'Source' } }
  override async listModels(): Promise<readonly LlmModelInfo[]> {
    return [{ provider: 'source', id: 'source-model', name: 'Source model' }]
  }
  override async resolveModel(): Promise<LlmResolvedModelInfo> {
    return { provider: 'source', id: 'source-model', name: 'Source model' }
  }
  override async *stream(): AsyncIterable<StreamChunk> {
    yield {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { code: 'RATE_LIMIT', status: 429, message: 'quota exhausted' },
      },
    }
  }
}

function targetModel(): LlmResolvedModelInfo {
  return {
    provider: 'target',
    id: 'target-model',
    name: 'Target model',
    reasoning: {
      efforts: [
        { id: 'low' as never, name: 'Low' },
        { id: 'high' as never, name: 'High' },
      ],
      defaultEffort: 'low' as never,
    },
  }
}

describe('failover reasoning effort', () => {
  it('publishes and persists a provider effort alongside model metadata', async () => {
    const preferences = new FailoverPreferences(new MemoryBackend())
    await preferences.setProviderEffort('target', 'high')
    expect(await preferences.effortFor('target', ['low', 'high'], 'low' as never)).toBe('high')
    expect(await preferences.effortFor('target', ['low'], 'low' as never)).toBe('low')

    const runtime: FailoverRuntime = {
      listProviders: () => [{ id: 'target', name: 'Target' }],
      listModels: async () => [{ provider: 'target', id: 'target-model', name: 'Target model' }],
      resolveModel: async () => targetModel(),
      stream: async function * () { yield { type: 'finish', reason: { kind: 'stop' } } },
    }
    const catalog = await preferences.describe(runtime, new Set(['target']))
    expect(catalog.providers[0]?.models[0]?.efforts).toEqual([
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High' },
    ])
    expect(catalog.providers[0]?.effort).toBe('high')
  })

  it('applies the configured destination effort when a request fails over', async () => {
    const preferences = new FailoverPreferences(new MemoryBackend())
    await preferences.setProviderEffort('target', 'high')
    let captured: GenerateOptions | undefined
    const runtime: FailoverRuntime = {
      listProviders: () => [
        { id: 'source', name: 'Source' },
        { id: 'target', name: 'Target' },
      ],
      listModels: async provider => provider === 'target'
        ? [{ provider, id: 'target-model', name: 'Target model' }]
        : [{ provider, id: 'source-model', name: 'Source model' }],
      resolveModel: async (provider) => provider === 'target' ? targetModel() : {
        provider: 'source', id: 'source-model', name: 'Source model',
      },
      stream: async function * (options) {
        captured = options
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
    const adapter = new AutoFailoverAdapter(runtime, preferences)
    adapter.configureRoute('source', {
      delegate: new SourceAdapter(),
      displayName: 'Source',
      rotate: async () => undefined,
      selectModel: async () => 'source-model',
      selectEffort: async () => undefined,
    })
    adapter.setAvailable('source', true)

    const chunks: StreamChunk[] = []
    for await (const chunk of adapter.stream({
      provider: 'source',
      model: 'source-model',
      reasoningEffort: 'low' as never,
      messages: [],
    })) chunks.push(chunk)

    expect(captured?.provider).toBe('target')
    expect(captured?.model).toBe('target-model')
    expect(captured?.reasoningEffort).toBe('high')
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  })
})
`)

replaceOnce(
  'package.json',
  'tests/proxy.spec.ts tests/failover.spec.ts',
  'tests/proxy.spec.ts tests/failover.spec.ts tests/context-window.spec.ts tests/provider-usage.spec.ts tests/failover-effort.spec.ts',
)
