import { describe, expect, it } from 'vitest'
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
    return { configured: this.values.has(ref), writable: true, source: 'memory' }
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
    await preferences.setProviderEnabled('target', true, ['source', 'target'])
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
    await preferences.setProviderEnabled('target', true, ['source', 'target'])
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
