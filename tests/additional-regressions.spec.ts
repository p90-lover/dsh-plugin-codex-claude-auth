import { afterEach, expect, it, vi } from 'vitest'
import { BrowserOAuthController } from '../src/browser-auth.ts'
import { AccountUsageMonitor } from '../src/account-usage.ts'
import { ProviderProxySetting, proxyDisplayName } from '../src/proxy.ts'
import { ProviderService } from '../src/client/api.ts'
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
