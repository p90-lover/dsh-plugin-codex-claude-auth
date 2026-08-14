import type {
  Api,
  AssistantMessageEventStream,
  Model,
  ModelsStoreEntry,
  Provider,
  ProviderModelsStore,
} from '@earendil-works/pi-ai'
import { describe, expect, it, vi } from 'vitest'
import { autoModelProvider } from '../src/model-discovery.ts'

function staticModel(provider: string, api: Api): Model<Api> {
  return {
    id: provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-5.6-sol',
    name: 'Static fallback',
    api,
    provider,
    baseUrl: provider === 'anthropic'
      ? 'https://api.anthropic.com'
      : 'https://chatgpt.com/backend-api',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 32_000,
  }
}

function baseProvider(provider: string, api: Api): Provider {
  const selected = staticModel(provider, api)
  const noStream = (): AssistantMessageEventStream => undefined as never
  return {
    id: provider,
    name: provider,
    baseUrl: selected.baseUrl,
    auth: {
      oauth: {
        name: 'OAuth',
        login: async () => ({ type: 'oauth', access: 'a', refresh: 'r', expires: 1 }),
        refresh: async credential => credential,
        toAuth: async credential => ({ apiKey: credential.access }),
      },
    },
    getModels: () => [selected],
    stream: noStream,
    streamSimple: noStream,
  }
}

function memoryStore(): ProviderModelsStore & { readonly entry: ModelsStoreEntry | undefined } {
  let entry: ModelsStoreEntry | undefined
  return {
    get entry() { return entry },
    read() { return Promise.resolve(entry) },
    write(value) { entry = value; return Promise.resolve() },
    delete() { entry = undefined; return Promise.resolve() },
  }
}

describe('OAuth model discovery', () => {
  it('loads the signed-in Codex catalog and materializes newly returned models', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe('/backend-api/codex/models')
      expect(url.searchParams.get('client_version')).toBe('0.147.0')
      expect(new Headers(init?.headers).get('chatgpt-account-id')).toBe('account-1')
      return new Response(JSON.stringify({
        models: [{
          slug: 'gpt-5.7-new',
          display_name: 'GPT 5.7 New',
          visibility: 'list',
          context_window: 400000,
          input_modalities: ['text', 'image'],
          supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }],
        }],
      }), { status: 200, headers: { 'content-type': 'application/json', etag: '"catalog-1"' } })
    })
    const provider = autoModelProvider(baseProvider('openai-codex', 'openai-codex-responses'), 'openai-codex', fetch)
    const store = memoryStore()
    await provider.refreshModels!({
      credential: {
        type: 'oauth',
        access: 'secret-access-token',
        refresh: 'secret-refresh-token',
        expires: Date.now() + 60_000,
        accountId: 'account-1',
      },
      store,
      allowNetwork: true,
    })

    expect(provider.getModels()).toEqual([
      expect.objectContaining({
        id: 'gpt-5.7-new',
        name: 'GPT 5.7 New',
        provider: 'openai-codex',
        contextWindow: 400000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
    ])
    expect(store.entry?.etag).toBe('"catalog-1"')
  })

  it('loads Claude capabilities and limits from the Anthropic models endpoint', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      expect(new URL(String(input)).pathname).toBe('/v1/models')
      return new Response(JSON.stringify({
        data: [{
          type: 'model',
          id: 'claude-opus-4-7',
          display_name: 'Claude Opus 4.7',
          max_input_tokens: 1000000,
          max_tokens: 128000,
          capabilities: {
            image_input: { supported: true },
            thinking: { supported: true },
            effort: {
              supported: true,
              low: { supported: true },
              medium: { supported: true },
              high: { supported: true },
              xhigh: { supported: true },
              max: { supported: false },
            },
          },
        }],
        has_more: false,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const provider = autoModelProvider(baseProvider('anthropic', 'anthropic-messages'), 'anthropic', fetch)
    await provider.refreshModels!({
      credential: {
        type: 'oauth',
        access: 'secret-access-token',
        refresh: 'secret-refresh-token',
        expires: Date.now() + 60_000,
      },
      store: memoryStore(),
      allowNetwork: true,
    })

    expect(provider.getModels()[0]).toMatchObject({
      id: 'claude-opus-4-7',
      name: 'Claude Opus 4.7',
      contextWindow: 1000000,
      maxTokens: 128000,
      input: ['text', 'image'],
      reasoning: true,
    })
  })

  it('keeps the bundled catalog when a remote refresh fails', async () => {
    const provider = autoModelProvider(
      baseProvider('openai-codex', 'openai-codex-responses'),
      'openai-codex',
      async () => new Response('', { status: 503 }),
    )
    await expect(provider.refreshModels!({
      credential: {
        type: 'oauth',
        access: 'secret-access-token',
        refresh: 'secret-refresh-token',
        expires: Date.now() + 60_000,
        accountId: 'account-1',
      },
      store: memoryStore(),
      allowNetwork: true,
    })).rejects.toThrow(/HTTP 503/u)
    expect(provider.getModels().map(model => model.id)).toEqual(['gpt-5.6-sol'])
  })
})
