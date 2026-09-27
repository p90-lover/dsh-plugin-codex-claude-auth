import { afterEach, expect, it, vi } from 'vitest'
import { BrowserOAuthController } from '../src/browser-auth.ts'
import { AccountUsageMonitor } from '../src/account-usage.ts'
import { ProviderProxySetting, proxyDisplayName } from '../src/proxy.ts'
import { ProviderService } from '../src/client/api.ts'
import { HarnessOAuthCredentialStore } from '../src/credential-store.ts'
import type { HarnessCredentialBackend } from '../src/credential-store.ts'
import { FailoverPreferences } from '../src/failover.ts'
afterEach(() => vi.unstubAllGlobals())
const status = { connected: true, accounts: [], proxy: { configured: false, providerConfigured: false, sharedConfigured: false, entries: [] }, failover: { providers: [] } }
it('refuses a malformed account row instead of crashing the UI', async () => {
  const service = new ProviderService(async () => Response.json({ ...status, accounts: [null] }))
  await service.load('codex')
  expect(service.snapshot('codex').data).toBeUndefined()
  expect(service.snapshot('codex').error).toContain('Invalid')
})
it('re-reads after an invalidation arrives during an older read', async () => {
  let finish: (r: Response) => void = () => {}
  let count = 0
  const service = new ProviderService(async () => ++count === 1 ? new Promise<Response>(r => { finish = r }) : Response.json({ ...status, connected: false }))
  const first = service.load('codex')
  const refresh = service.load('codex', true)
  finish(Response.json(status))
  await Promise.all([first, refresh])
  expect(count).toBe(2)
  expect(service.snapshot('codex').data?.connected).toBe(false)
})
it('re-reads when another invalidation arrives during the queued refresh', async () => {
  let finishFirst: (r: Response) => void = () => {}
  let finishSecond: (r: Response) => void = () => {}
  let count = 0
  const service = new ProviderService(async () => {
    count += 1
    if (count === 1) return new Promise<Response>(resolve => { finishFirst = resolve })
    if (count === 2) return new Promise<Response>(resolve => { finishSecond = resolve })
    return Response.json({ ...status, connected: false })
  })
  const first = service.load('codex')
  const refresh = service.load('codex', true)
  finishFirst(Response.json(status))
  await vi.waitFor(() => expect(count).toBe(2))
  const latest = service.load('codex', true)
  finishSecond(Response.json(status))
  await Promise.all([first, refresh, latest])
  expect(service.snapshot('codex').data?.connected).toBe(false)
  expect(count).toBe(3)
  service.dispose()
})
it('refreshes shared settings invalidated while another provider mutation is busy', async () => {
  const previous = { ...status, proxy: { ...status.proxy, defaultProxyId: 'previous-proxy' } }
  const updated = { ...status, proxy: { ...status.proxy, defaultProxyId: 'new-proxy' } }
  let saved = previous
  let finishCodex: (r: Response) => void = () => {}
  let finishClaude: (r: Response) => void = () => {}
  const service = new ProviderService(async (url, init) => {
    if (init?.method === 'POST') return new Promise<Response>(resolve => {
      if (String(url).includes('openai-codex')) finishCodex = resolve
      else finishClaude = resolve
    })
    return Response.json(saved)
  })
  await service.refreshAll()
  const codex = service.mutate('codex', '/account/select', { accountId: 'other-account' })
  const claude = service.mutate('claude', '/proxy/default', { proxyId: 'new-proxy' })
  saved = updated
  finishClaude(Response.json(updated))
  await claude
  finishCodex(Response.json(previous))
  await codex
  expect(service.snapshot('codex').data?.proxy.defaultProxyId).toBe('new-proxy')
  service.dispose()
})
it('does not cache an account snapshot after its credentials were invalidated', async () => {
  let finish: (r: Response) => void = () => {}
  let reads = 0
  const entries = [{ account: { id: 'a', label: 'A', active: true, useResetCredit: false }, credential: { type: 'oauth', access: 'fake', refresh: 'fake', expires: Date.now() + 60000 } }]
  vi.stubGlobal('fetch', vi.fn(async () => ++reads === 1 ? new Promise<Response>(r => { finish = r }) : Response.json({ five_hour: { utilization: 20 } })))
  const monitor = new AccountUsageMonitor('anthropic', { accountCredentials: async () => entries } as never, () => undefined)
  const first = monitor.read()
  await vi.waitFor(() => expect(reads).toBe(1))
  monitor.invalidate()
  finish(Response.json({ five_hour: { utilization: 80 } }))
  await first
  expect((await monitor.read())[0]?.usage.remainingPercent).toBe(80)
  expect(reads).toBe(2)
})
it('uses the provider proxy when a removed account override no longer exists', async () => {
  const values = new Map([['shared', JSON.stringify({ version: 1, proxies: [{ id: 'default', label: 'Default', url: 'http://default.example:8080/' }, { id: 'provider', label: 'Provider', url: 'http://provider.example:8080/' }] })], ['own', JSON.stringify({ version: 1, proxyId: 'provider' })]])
  const setting = new ProviderProxySetting({ resolve: async (ref: string) => ({ value: values.get(ref)! }) } as never, 'own' as never, 'shared' as never)
  await setting.refresh()
  expect(setting.valueForAssignment('removed')).toBe('http://provider.example:8080/')
  expect(proxyDisplayName('http://[::1]:8888/')).toBe('http://[::1]:8888')
})
it('validates account effort against the inherited model when its saved model was removed', async () => {
  const values = new Map<string, string>()
  const backend: HarnessCredentialBackend = {
    resolve: async ref => values.has(ref) ? { value: values.get(ref)!, source: 'test' } : undefined,
    describe: async ref => ({ configured: values.has(ref), writable: true }),
    set: async (ref, value) => { values.set(ref, value) }, unset: async ref => { values.delete(ref) },
  }
  const store = new HarnessOAuthCredentialStore(backend, new Map([['openai-codex', 'TEST_OAUTH' as never]]))
  await store.modify('openai-codex', async () => ({
    type: 'oauth', access: 'fake-access', refresh: 'fake-refresh', expires: Date.now() + 60_000,
  }))
  const account = (await store.accounts('openai-codex'))[0]!
  await store.setAccountFailoverModel('openai-codex', account.id, 'removed-model')
  const preferences = new FailoverPreferences(backend)
  await preferences.setProviderModel('openai-codex-oauth', 'preferred-model')
  const runtime = {
    listProviders: () => [{ id: 'openai-codex-oauth', name: 'Codex' }],
    listModels: async () => ['preferred-model', 'middle-model', 'last-model'].map(id => ({ id, name: id, provider: 'openai-codex-oauth' })),
    resolveModel: async (provider: string, model: string) => {
      if (model === 'removed-model') throw new Error('Model is unavailable')
      return { provider, id: model, name: model, reasoning: { efforts: [{ id: (model === 'preferred-model' ? 'high' : 'low') as never, name: 'Effort' }] } }
    },
    stream: async function* () {},
  }
  const controller = new BrowserOAuthController({} as never, store,
    { refresh: async () => {}, setActiveAccountProxyId: () => {}, describe: () => ({}) } as never,
    { read: async () => [] } as never, 'openai-codex', 'Codex', () => {}, undefined, undefined,
    preferences, runtime)
  await controller.setAccountFailoverEffort(account.id, 'high')
  expect((await store.accounts('openai-codex'))[0]?.failoverEffort).toBe('high')
})
it('rejects unsupported provider reasoning effort before persisting it', async () => {
  const write = vi.fn(async () => {})
  const controller = new BrowserOAuthController({} as never, { read: async () => undefined } as never,
    { refresh: async () => {}, setActiveAccountProxyId: () => {}, describe: () => ({}) } as never,
    { read: async () => [] } as never, 'openai-codex', 'Codex', () => {}, undefined, undefined,
    { modelFor: async () => 'model', setProviderEffort: write, describe: async () => ({ providers: [] }) } as never,
    { listProviders: () => [{ id: 'target' }], listModels: async () => [{ id: 'model' }], resolveModel: async () => ({ reasoning: { efforts: [{ id: 'low' }] } }) } as never)
  await expect(controller.setProviderFailoverEffort('target', 'unsupported')).rejects.toThrow(/effort/i)
  expect(write).not.toHaveBeenCalled()
})
