import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  Provider,
} from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { routedProvider } from '../src/routed-provider.ts'

function model(provider: string): Model<Api> {
  return {
    id: 'model-1',
    name: 'Model 1',
    api: 'openai-responses',
    provider,
    baseUrl: 'https://example.test',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1024,
    maxTokens: 128,
  }
}

describe('routedProvider', () => {
  it('publishes the Harness route but restores the upstream provider id for dispatch', async () => {
    let dispatchedProvider: string | undefined
    const baseModel = model('upstream')
    const stream = (): AssistantMessageEventStream => undefined as never
    const base: Provider = {
      id: 'upstream',
      name: 'Upstream',
      auth: {
        oauth: {
          name: 'OAuth',
          login: async () => ({ type: 'oauth', access: 'a', refresh: 'r', expires: 1 }),
          refresh: async credential => credential,
          toAuth: async credential => ({ apiKey: credential.access }),
        },
      },
      getModels: () => [baseModel],
      stream: (selected) => {
        dispatchedProvider = selected.provider
        return stream()
      },
      streamSimple: (selected) => {
        dispatchedProvider = selected.provider
        return stream()
      },
    }
    const routed = routedProvider(base, 'oauth-route', 'OAuth Route')
    const selected = routed.getModels()[0]

    expect(routed.id).toBe('oauth-route')
    expect(selected?.provider).toBe('oauth-route')
    expect(routed.auth.apiKey).toBeDefined()

    routed.streamSimple(selected!, { systemPrompt: '', messages: [], tools: [] } as Context)
    expect(dispatchedProvider).toBe('upstream')
  })
})
