import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { Api, Model, OAuthCredential } from '@earendil-works/pi-ai'
import { afterEach, expect, it, vi } from 'vitest'
import { applyOAuthProvider } from '../src/provider-plugin.ts'
import type { HarnessCredentialBackend } from '../src/credential-store.ts'
import type { PublicProviderStatus } from '../src/shared/contracts.ts'

afterEach(() => vi.unstubAllGlobals())

it.each(['forms', 'sections'])('publishes refreshed models with the %s settings API before acknowledging refresh', async settingsApi => {
  let catalog = 'gpt-first'
  const credential: OAuthCredential = {
    type: 'oauth', access: 'fake-access', refresh: 'fake-refresh',
    expires: Date.now() + 3_600_000, accountId: 'fake-account',
  }
  const values = new Map([['TEST_OAUTH', JSON.stringify(credential)]])
  const backend: HarnessCredentialBackend = {
    resolve: async ref => values.has(ref) ? { value: values.get(ref)!, source: 'test' } : undefined,
    describe: async ref => ({ configured: values.has(ref), writable: true }),
    set: async (ref, value) => { values.set(ref, value) },
    unset: async ref => { values.delete(ref) },
  }
  const model: Model<Api> = {
    id: 'gpt-bundled', name: 'Bundled', api: 'openai-codex-responses',
    provider: 'openai-codex', baseUrl: 'https://chatgpt.com/backend-api',
    reasoning: false, input: ['text'], contextWindow: 400_000, maxTokens: 32_000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/codex/models')) {
      return Response.json({ models: [{ slug: catalog, display_name: catalog, context_window: 400_000 }] })
    }
    return Response.json({})
  }))

  let adapter: LlmAdapter
  let handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  let prefix = ''
  let active: readonly string[] = []
  let replacements = 0
  const ctx = {
    credentials: backend,
    fiber: {},
    settings: settingsApi === 'forms' ? { configure: () => () => {} } : { installSection: () => {} },
    llm: {
      registerAdapter: (_routes: readonly string[], selected: LlmAdapter) => {
        adapter = selected
        return { replace: (routes: readonly string[]) => { active = routes; replacements += 1 } }
      },
      registerConfigurableProviders: () => ({ replace: () => {} }),
      listProviders: () => active.map(id => ({ id, name: 'Test' })),
      listConfigurableProviders: () => [],
      listModels: async (id: string) => [...await adapter.listModels(id)],
      resolveModel: (id: string, name: string) => adapter.resolveModel(id, name),
    },
    logger: { warn: vi.fn() },
    inject: (services: string[], callback: (scope: unknown) => void) => {
      if (services.includes('webServer') || services.includes('settings')) callback(ctx)
    },
    effect: (callback: () => unknown) => { callback() },
    on: () => () => {},
    get: () => undefined,
    connection: { requestRejection: () => undefined },
    webServer: {
      register: (route: { path: string; handler: typeof handler }) => {
        prefix = route.path
        handler = route.handler
        return () => {}
      },
    },
  }
  applyOAuthProvider(ctx as unknown as Context, {}, {
    authProviderId: 'openai-codex', modelCatalog: 'openai-codex',
    defaults: {
      route: 'test-route', displayName: 'Test', credentialRef: 'TEST_OAUTH',
      proxyCredentialRef: 'TEST_PROXY', loginCommand: 'test-login',
      statusCommand: 'test-status', logoutCommand: 'test-logout',
    },
    createProvider: () => ({
      id: 'openai-codex', name: 'Test', baseUrl: model.baseUrl,
      auth: { oauth: {
        name: 'OAuth', login: async () => credential, refresh: async value => value,
        toAuth: async value => ({ apiKey: value.access }),
      } },
      getModels: () => [model],
      stream: () => { throw new Error('Stream is outside this catalog test') },
      streamSimple: () => { throw new Error('Stream is outside this catalog test') },
    }),
  })
  await vi.waitFor(async () => {
    expect((await adapter.listModels('test-route')).map(item => item.id)).toEqual(['gpt-first'])
  })
  const beforeRefresh = replacements
  catalog = 'gpt-new'
  const req = Object.assign(Readable.from([Buffer.from('{}')]), {
    method: 'POST', url: prefix + '/refresh',
    headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' },
  }) as IncomingMessage
  let responseStatus = 0
  let responseBody = ''
  await handler!(req, {
    writeHead: (value: number) => { responseStatus = value },
    end: (value: string) => { responseBody = value },
  } as unknown as ServerResponse)
  const status = JSON.parse(responseBody) as PublicProviderStatus
  expect(responseStatus).toBe(200)
  expect(Object.keys(status.contextWindow!.modelLimits)).toEqual(['gpt-new'])
  expect((await adapter!.listModels('test-route')).map(item => item.id)).toEqual(['gpt-new'])
  expect(replacements).toBeGreaterThan(beforeRefresh)
})
