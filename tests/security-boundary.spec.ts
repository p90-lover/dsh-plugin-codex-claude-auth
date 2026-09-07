import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { installBrowserOAuth } from '../src/browser-auth.ts'

function fixture(rejection: 401 | 403 | undefined) {
  let handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  const read = vi.fn(async () => undefined)
  const nativeGuard = vi.fn(() => rejection)
  const scope = {
    connection: { requestRejection: nativeGuard },
    webServer: { register: (route: { handler: typeof handler }) => { handler = route.handler; return () => {} } },
    effect: (fn: () => unknown) => fn(),
  }
  const ctx = { inject: (_: string[], fn: (ctx: typeof scope) => void) => fn(scope) }
  installBrowserOAuth(ctx as unknown as Context, {} as never, { read } as never,
    { refresh: async () => {}, setActiveAccountProxyId: () => {}, describe: () => ({}) } as never,
    { read: async () => [] } as never, 'openai-codex', 'Codex', 'openai-codex-oauth', () => {})
  return { read, nativeGuard, request: async (method = 'GET') => {
    let status = 0; let body: string | undefined
    await handler({ method, url: '/plugins/dsh-oauth-model-providers/oauth/openai-codex-oauth/status',
      headers: { host: 'localhost:3080', origin: 'http://localhost:3080' } } as IncomingMessage,
    { writeHead: (value: number) => { status = value }, end: (value: string) => { body = value } } as unknown as ServerResponse)
    return { status, body }
  } }
}
describe('native browser trust boundary', () => {
  it.each(['GET', 'HEAD', 'POST'])('refuses unauthenticated %s before reading credentials', async method => {
    const f = fixture(401)
    expect((await f.request(method)).status).toBe(401)
    expect(f.read).not.toHaveBeenCalled()
  })
  it('refuses a rebound or cross-site host before controller access', async () => {
    const f = fixture(403)
    expect((await f.request()).status).toBe(403)
    expect(f.read).not.toHaveBeenCalled()
  })
  it('serves status after the native guard accepts', async () => {
    const f = fixture(undefined)
    expect((await f.request()).status).toBe(200)
    expect(f.nativeGuard).toHaveBeenCalledOnce()
  })
})
