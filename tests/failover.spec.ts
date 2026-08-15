import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { describe, expect, it } from 'vitest'
import type { HarnessCredentialBackend } from '../src/credential-store.ts'
import { AutoFailoverAdapter, FailoverPreferences } from '../src/failover.ts'

function backend(): HarnessCredentialBackend {
  const values = new Map<string, string>()
  return {
    resolve: async ref => values.has(ref) ? { value: values.get(ref)!, source: 'test' } : undefined,
    describe: async ref => ({ configured: values.has(ref), writable: true }),
    set: async (ref, value) => { values.set(ref, value) },
    unset: async ref => { values.delete(ref) },
  }
}

function failure(): StreamChunk {
  return {
    type: 'finish',
    reason: { kind: 'error', failure: { code: 'RATE_LIMIT', message: 'HTTP 429', status: 429 } },
  }
}

function success(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' }, replayState: { kind: 'opaque-target' } },
  ]
}

class FakeAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly route: string, private readonly attempts: StreamChunk[][]) { super() }
  override providerInfo(): LlmProviderInfo { return { id: this.route, name: this.route } }
  override providerRetryPolicy(): ResolvedRetryPolicy | undefined { return undefined }
  override listModels(): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(['source-low', 'source-mid', 'source-high'].map(id => ({ provider: this.route, id, name: id })))
  }
  override resolveModel(_provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider: this.route, id: model, name: model })
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    for (const chunk of this.attempts.shift() ?? success('source-ok')) yield chunk
  }
}

describe('automatic provider failover', () => {
  it('switches account first, then uses the next provider middle model and keeps later turns sticky', async () => {
    const preferences = new FailoverPreferences(backend())
    const targetRequests: GenerateOptions[] = []
    const targetModels = ['target-low', 'target-mid', 'target-high']
    const runtime = {
      listProviders: () => [
        { id: 'source', name: 'Source' },
        { id: 'target', name: 'Target' },
      ],
      listModels: async (provider: string) => provider === 'target'
        ? targetModels.map(id => ({ provider, id, name: id }))
        : [],
      stream: (options: GenerateOptions): AsyncIterable<StreamChunk> => (async function* () {
        targetRequests.push(options)
        for (const chunk of success('target-ok')) yield chunk
      })(),
    }
    const source = new FakeAdapter('source', [[failure()], [failure()]])
    const adapter = new AutoFailoverAdapter(runtime, preferences)
    adapter.configureRoute('source', {
      delegate: source,
      displayName: 'Source',
      rotate: async () => ({ from: { label: 'Account 1' }, to: { label: 'Account 2' } }),
      selectModel: async () => 'source-mid',
    })
    adapter.setAvailable('source', true)
    const oldReplay = { kind: 'pi-ai', version: 1, provider: 'source', model: 'source-low' }
    const options = {
      provider: 'source',
      model: 'source-low',
      sessionId: 'session-1' as GenerateOptions['sessionId'],
      messages: [{
        id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: 'old' }],
        source: { kind: 'model', provider: 'source', model: 'source-low', replayState: oldReplay },
      }],
    } as GenerateOptions

    const first: StreamChunk[] = []
    for await (const chunk of adapter.stream(options)) first.push(chunk)
    expect(source.requests.map(request => request.model)).toEqual(['source-low', 'source-mid'])
    expect(targetRequests[0]?.model).toBe('target-mid')
    expect(targetRequests[0]?.messages[0]).not.toHaveProperty('source.replayState')
    expect(first.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('')).toContain('Provider switched automatically')
    expect(first.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })

    for await (const _chunk of adapter.stream(options)) { /* sticky continuation */ }
    expect(targetRequests).toHaveLength(2)
    expect(source.requests).toHaveLength(2)
  })

  it('lets a configured provider model override the automatic middle choice', async () => {
    const preferences = new FailoverPreferences(backend())
    await preferences.setProviderModel('target', 'target-high')
    await expect(preferences.modelFor('target', ['target-low', 'target-mid', 'target-high']))
      .resolves.toBe('target-high')
  })

  it('detects registered and configurable providers and exposes the actual middle-tier default', async () => {
    const preferences = new FailoverPreferences(backend())
    const runtime = {
      listProviders: () => [{ id: 'deepseek', name: 'DeepSeek' }],
      listConfigurableProviders: () => [
        { provider: 'deepseek', displayName: 'DeepSeek duplicate' },
        { provider: 'anthropic-api', displayName: 'Anthropic API' },
      ],
      listModels: async (provider: string) => provider === 'deepseek'
        ? [
            { provider, id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
            { provider, id: 'deepseek-chat', name: 'DeepSeek Chat' },
          ]
        : [
            { provider, id: 'claude-haiku', name: 'Claude Haiku' },
            { provider, id: 'claude-sonnet', name: 'Claude Sonnet' },
            { provider, id: 'claude-opus', name: 'Claude Opus' },
          ],
      stream: (_options: GenerateOptions): AsyncIterable<StreamChunk> => (async function* () {})(),
    }

    const status = await preferences.describe(runtime, new Set(['deepseek']))
    expect(status.providers.map(provider => provider.id)).toEqual(['deepseek', 'anthropic-api'])
    expect(status.providers[0]).toMatchObject({ available: true, defaultModel: 'deepseek-chat' })
    expect(status.providers[1]).toMatchObject({ available: false, defaultModel: 'claude-sonnet' })
  })
})
