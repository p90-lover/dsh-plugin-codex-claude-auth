import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  Provider,
  SimpleStreamOptions,
} from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { normalizeProxyUrl, proxyAwareProvider, proxyDisplayName } from '../src/proxy.ts'
import { ProviderProxySetting } from '../src/proxy.ts'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'

function model(): Model<Api> {
  return {
    id: 'model-1',
    name: 'Model 1',
    api: 'openai-responses',
    provider: 'upstream',
    baseUrl: 'https://example.test',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1024,
    maxTokens: 128,
  }
}

describe('provider proxy', () => {
  it('accepts only pathless HTTP(S) proxy URLs and never displays credentials', () => {
    const value = normalizeProxyUrl('http://alice:secret@proxy.example:8080')
    expect(value).toContain('alice:secret@')
    expect(proxyDisplayName(value)).toBe('http://proxy.example:8080')
    expect(proxyDisplayName(value)).not.toContain('alice')
    expect(proxyDisplayName(value)).not.toContain('secret')
    expect(() => normalizeProxyUrl('socks5://proxy.example:1080')).toThrow(/HTTP and HTTPS/u)
    expect(() => normalizeProxyUrl('https://proxy.example/path')).toThrow(/path/u)
  })

  it('scopes model traffic to SSE with provider-specific proxy environment values', () => {
    let options: SimpleStreamOptions | undefined
    const selected = model()
    const emptyStream = (): AssistantMessageEventStream => undefined as never
    const base: Provider = {
      id: 'upstream',
      name: 'Upstream',
      auth: { apiKey: { name: 'Key', resolve: async () => undefined } },
      getModels: () => [selected],
      stream: () => emptyStream(),
      streamSimple: (_model, _context, received) => {
        options = received
        return emptyStream()
      },
    }
    const proxied = proxyAwareProvider(base, () => 'http://proxy.example:8080/')

    proxied.streamSimple(selected, { systemPrompt: '', messages: [], tools: [] } as Context, { transport: 'auto' })

    expect(options?.transport).toBe('sse')
    expect(options?.env).toMatchObject({
      HTTP_PROXY: 'http://proxy.example:8080/',
      HTTPS_PROXY: 'http://proxy.example:8080/',
      NO_PROXY: 'localhost,127.0.0.1,::1',
    })
  })

  it('prefers one shared proxy and can promote a saved provider proxy without exposing credentials', async () => {
    const values = new Map<string, string>([['provider', 'http://test-user:test-password@proxy.example:8080/']])
    const backend = {
      resolve: async (key: CredentialRef) => values.has(key) ? { value: values.get(key)!, source: 'test' } : undefined,
      describe: async (key: CredentialRef) => ({ configured: values.has(key), writable: true }),
      set: async (key: CredentialRef, value: string) => { values.set(key, value) },
      unset: async (key: CredentialRef) => { values.delete(key) },
    }
    const setting = new ProviderProxySetting(backend, 'provider' as CredentialRef, 'shared' as CredentialRef)
    await setting.promoteToShared()
    expect(setting.describe()).toMatchObject({ configured: true, source: 'shared', sharedConfigured: true })
    expect(setting.describe().display).toBe('http://proxy.example:8080')
    expect(JSON.stringify(setting.describe())).not.toContain('test-password')
  })
})
