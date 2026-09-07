import { describe, expect, it } from 'vitest'
import { ProviderService } from '../src/client/api.ts'

const status = { connected: true, accounts: [], proxy: { configured: false, providerConfigured: false, sharedConfigured: false, entries: [] }, failover: { providers: [] } }
it('keeps a working provider visible when the other provider fails', async () => {
  const service = new ProviderService(async (url) => String(url).includes('anthropic')
    ? new Response('gateway failure', { status: 502 }) : Response.json(status))
  await service.refreshAll()
  expect(service.snapshot('codex').data?.connected).toBe(true)
  expect(service.snapshot('claude').error).toContain('502')
})
it('rejects a successful-looking response that is not a provider status', async () => {
  const service = new ProviderService(async () => Response.json({ ok: true }))
  await service.load('codex')
  expect(service.snapshot('codex').data).toBeUndefined()
  expect(service.snapshot('codex').error).toContain('Invalid')
})
it('does not overwrite a confirmed mutation with an older pending GET', async () => {
  let finish: ((r: Response) => void) | undefined
  const service = new ProviderService(async (_url, init) => init?.method === 'POST'
    ? Response.json({ ...status, connected: false })
    : new Promise<Response>(r => { finish = r }))
  const read = service.load('codex')
  await service.mutate('codex', '/logout', {})
  finish!(Response.json(status))
  await read
  expect(service.snapshot('codex').data?.connected).toBe(false)
})
it('does not report a failed save as successful', async () => {
  const service = new ProviderService(async () => Response.json({ error: 'cannot save' }, { status: 400 }))
  await expect(service.mutate('codex', '/context-window', { value: 500000 })).rejects.toThrow('cannot save')
  expect(service.snapshot('codex').busy).toBe(false)
})
