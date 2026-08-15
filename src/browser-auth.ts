import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  AuthEvent,
  AuthInteraction,
  AuthPrompt,
  Models,
} from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { HarnessOAuthCredentialStore } from './credential-store.ts'
import type { PublicAccountWithUsage } from './account-usage.ts'
import type { AccountUsageMonitor } from './account-usage.ts'
import type { ProviderProxySetting, PublicProxySetting } from './proxy.ts'
import type { ContextWindowStatus, OpenAIContextWindowPreference } from './context-window.ts'
import type { FailoverPreferences, FailoverRuntime, PublicFailoverPreferences } from './failover.ts'

const BODY_LIMIT_BYTES = 16 * 1024
const API_ROOT = '/plugins/dsh-oauth-model-providers/oauth'

export type BrowserOAuthPhase =
  | 'starting'
  | 'input'
  | 'authorizing'
  | 'device_code'
  | 'complete'
  | 'error'
  | 'cancelled'

export interface BrowserOAuthPrompt {
  id: string
  type: AuthPrompt['type']
  message: string
  placeholder?: string
  options?: readonly { id: string; label: string; description?: string }[]
}

export interface BrowserOAuthState {
  id: string
  providerName: string
  phase: BrowserOAuthPhase
  revision: number
  connected: boolean
  prompt?: BrowserOAuthPrompt
  authUrl?: string
  authInstructions?: string
  deviceCode?: {
    userCode: string
    verificationUri: string
    expiresInSeconds?: number
  }
  progress?: string
  error?: string
}

export interface BrowserOAuthStatus {
  connected: boolean
  accounts: readonly PublicAccountWithUsage[]
  proxy: PublicProxySetting
  contextWindow?: ContextWindowStatus
  failover: PublicFailoverPreferences
}

interface BrowserOAuthChange {
  phase?: BrowserOAuthPhase
  connected?: boolean
  prompt?: BrowserOAuthPrompt | undefined
  authUrl?: string | undefined
  authInstructions?: string | undefined
  deviceCode?: BrowserOAuthState['deviceCode'] | undefined
  progress?: string | undefined
  error?: string | undefined
}

interface PendingPrompt {
  id: string
  prompt: AuthPrompt
  resolve: (value: string) => void
  reject: (error: Error) => void
  cleanup: () => void
}

function terminal(phase: BrowserOAuthPhase): boolean {
  return phase === 'complete' || phase === 'error' || phase === 'cancelled'
}

function publicError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/([?&#](?:code|state|access_token|refresh_token)=)[^&#\s]+/giu, '$1[redacted]')
    .replace(/(https?:\/\/)[^/\s@]+@/giu, '$1[redacted]@')
    .replace(/\b(?:ac_|sk-)[A-Za-z0-9._-]{8,}\b/gu, '[redacted]')
}

function cloneState(state: BrowserOAuthState): BrowserOAuthState {
  return {
    ...state,
    ...state.prompt === undefined
      ? {}
      : {
          prompt: {
            ...state.prompt,
            ...state.prompt.options === undefined
              ? {}
              : { options: state.prompt.options.map(option => ({ ...option })) },
          },
        },
    ...state.deviceCode === undefined ? {} : { deviceCode: { ...state.deviceCode } },
  }
}

/** One host-owned OAuth interaction whose public state is polled by Settings. */
export class BrowserOAuthFlow {
  readonly id = randomUUID()
  private readonly abort = new AbortController()
  private pending: PendingPrompt | undefined
  private state: BrowserOAuthState

  constructor(private readonly providerName: string) {
    this.state = {
      id: this.id,
      providerName,
      phase: 'starting',
      revision: 0,
      connected: false,
      progress: 'Starting sign-in…',
    }
  }

  snapshot(): BrowserOAuthState {
    return cloneState(this.state)
  }

  isTerminal(): boolean {
    return terminal(this.state.phase)
  }

  /** Reconcile the public flow with a credential already committed by pi-ai. */
  reconcileConnected(): BrowserOAuthState {
    if (this.state.phase === 'complete' && this.state.connected) return this.snapshot()
    this.update({
      phase: 'complete',
      connected: true,
      prompt: undefined,
      progress: 'Sign-in completed.',
      error: undefined,
    })
    // A provider may still be settling a now-obsolete manual fallback prompt.
    // Abort it only after publishing success; the login rejection handler sees
    // the aborted signal and cannot replace this definitive stored state.
    this.abort.abort('OAuth credential already stored')
    return this.snapshot()
  }

  private update(change: BrowserOAuthChange): void {
    const next = { ...this.state, revision: this.state.revision + 1 }
    const mutable = next as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(change)) {
      if (value === undefined) delete mutable[key]
      else mutable[key] = value
    }
    this.state = next
  }

  private clearPrompt(): void {
    this.pending?.cleanup()
    this.pending = undefined
    this.update({ prompt: undefined })
  }

  private interaction(): AuthInteraction {
    return {
      signal: this.abort.signal,
      prompt: prompt => this.prompt(prompt),
      notify: event => { this.notify(event) },
    }
  }

  start(login: (interaction: AuthInteraction) => Promise<void>): void {
    void login(this.interaction()).then(() => {
      this.pending?.cleanup()
      this.pending = undefined
      this.update({
        phase: 'complete',
        connected: true,
        prompt: undefined,
        progress: 'Sign-in completed.',
        error: undefined,
      })
    }, (error: unknown) => {
      this.pending?.cleanup()
      this.pending = undefined
      if (this.state.phase === 'cancelled' || this.abort.signal.aborted) return
      this.update({
        phase: 'error',
        prompt: undefined,
        progress: undefined,
        error: publicError(error),
      })
    })
  }

  private prompt(prompt: AuthPrompt): Promise<string> {
    if (this.abort.signal.aborted) return Promise.reject(new Error('Sign-in cancelled'))
    if (this.pending !== undefined) {
      this.pending.cleanup()
      this.pending.reject(new Error('A newer sign-in prompt replaced this one.'))
    }

    const id = randomUUID()
    const publicPrompt: BrowserOAuthPrompt = {
      id,
      type: prompt.type,
      message: prompt.message,
      ...'placeholder' in prompt && prompt.placeholder !== undefined
        ? { placeholder: prompt.placeholder }
        : {},
      ...prompt.type === 'select'
        ? { options: prompt.options.map(option => ({ ...option })) }
        : {},
    }
    this.update({ phase: 'input', prompt: publicPrompt, progress: undefined })

    return new Promise<string>((resolve, reject) => {
      const rejectFlow = (): void => {
        const pending = this.pending
        if (pending?.id !== id) return
        pending.cleanup()
        this.pending = undefined
        reject(new Error('Sign-in cancelled'))
      }
      const rejectPrompt = (): void => {
        const pending = this.pending
        if (pending?.id !== id) return
        pending.cleanup()
        this.pending = undefined
        this.update({ prompt: undefined, phase: this.state.authUrl === undefined ? 'starting' : 'authorizing' })
        reject(new Error('Sign-in prompt closed'))
      }
      this.abort.signal.addEventListener('abort', rejectFlow, { once: true })
      prompt.signal?.addEventListener('abort', rejectPrompt, { once: true })
      const cleanup = (): void => {
        this.abort.signal.removeEventListener('abort', rejectFlow)
        prompt.signal?.removeEventListener('abort', rejectPrompt)
      }
      this.pending = { id, prompt, resolve, reject, cleanup }
    })
  }

  private notify(event: AuthEvent): void {
    if (this.isTerminal()) return
    if (event.type === 'auth_url') {
      this.update({
        authUrl: event.url,
        ...event.instructions === undefined ? {} : { authInstructions: event.instructions },
        phase: this.pending === undefined ? 'authorizing' : 'input',
        progress: 'Waiting for the browser callback…',
      })
      return
    }
    if (event.type === 'device_code') {
      this.update({
        phase: 'device_code',
        deviceCode: {
          userCode: event.userCode,
          verificationUri: event.verificationUri,
          ...event.expiresInSeconds === undefined ? {} : { expiresInSeconds: event.expiresInSeconds },
        },
        progress: 'Waiting for device authorization…',
      })
      return
    }
    if (event.type === 'progress') {
      this.update({ progress: event.message })
      return
    }
    this.update({ progress: event.message })
  }

  respond(promptId: string, value: string): BrowserOAuthState {
    const pending = this.pending
    if (pending === undefined || pending.id !== promptId) {
      throw new HttpError(409, 'This sign-in prompt is no longer active.')
    }
    const answer = value.trim()
    if (answer.length === 0) throw new HttpError(400, 'Enter or select a value.')
    if (pending.prompt.type === 'select'
      && !pending.prompt.options.some(option => option.id === answer)) {
      throw new HttpError(400, 'Select one of the available sign-in methods.')
    }
    pending.cleanup()
    this.pending = undefined
    this.update({
      prompt: undefined,
      phase: this.state.authUrl === undefined ? 'starting' : 'authorizing',
      progress: this.state.authUrl === undefined ? 'Starting selected sign-in method…' : 'Waiting for the browser callback…',
    })
    pending.resolve(answer)
    return this.snapshot()
  }

  cancel(): BrowserOAuthState {
    if (this.isTerminal()) return this.snapshot()
    this.update({
      phase: 'cancelled',
      prompt: undefined,
      progress: 'Sign-in cancelled.',
      error: undefined,
    })
    const pending = this.pending
    this.abort.abort('Sign-in cancelled')
    if (pending !== undefined && this.pending?.id === pending.id) {
      pending.cleanup()
      this.pending = undefined
      pending.reject(new Error('Sign-in cancelled'))
    }
    return this.snapshot()
  }
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

interface JsonRecord {
  [key: string]: unknown
}

async function readJson(req: IncomingMessage): Promise<JsonRecord> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Expected application/json.')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > BODY_LIMIT_BYTES) throw new HttpError(413, 'Request body is too large.')
    chunks.push(buffer)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return parsed as JsonRecord
  } catch {
    throw new HttpError(400, 'Request body must be a JSON object.')
  }
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin === undefined || host === undefined) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && parsed.host === host
      && req.headers['sec-fetch-site'] !== 'cross-site'
  } catch {
    return false
  }
}

function sendJson(res: ServerResponse, status: number, value: unknown, head = false): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(head ? undefined : body)
}

/** Host coordinator for status, proxy secrets, logout, and one live OAuth flow. */
export class BrowserOAuthController {
  private active: BrowserOAuthFlow | undefined

  constructor(
    private readonly models: Models,
    private readonly store: HarnessOAuthCredentialStore,
    private readonly proxy: ProviderProxySetting,
    private readonly usage: AccountUsageMonitor,
    private readonly authProviderId: string,
    private readonly providerName: string,
    private readonly setAvailable: (available: boolean) => void,
    private readonly contextWindow?: OpenAIContextWindowPreference,
    private readonly publishContextWindow?: () => Promise<void>,
    private readonly failover?: FailoverPreferences,
    private readonly failoverRuntime?: FailoverRuntime,
    private readonly availableFailoverRoutes?: () => ReadonlySet<string>,
  ) {}

  async status(): Promise<BrowserOAuthStatus> {
    await this.proxy.refresh()
    const stored = await this.store.read(this.authProviderId)
    const connected = stored?.type === 'oauth'
    const accounts = await this.usage.read()
    this.proxy.setActiveAccountProxyId(accounts.find(account => account.active)?.proxyId)
    const failover = this.failover === undefined || this.failoverRuntime === undefined
      ? { providers: [] }
      : await this.failover.describe(
        this.failoverRuntime,
        this.availableFailoverRoutes?.() ?? new Set(),
      )
    return {
      connected,
      accounts,
      proxy: this.proxy.describe(),
      failover,
      ...this.contextWindow === undefined ? {} : { contextWindow: this.contextWindow.status() },
    }
  }

  async start(): Promise<BrowserOAuthState> {
    await this.proxy.refresh()
    this.active?.cancel()
    const flow = new BrowserOAuthFlow(this.providerName)
    this.active = flow
    const finishEnrollment = this.store.beginEnrollment(this.authProviderId)
    flow.start(async interaction => {
      try {
      await this.models.login(this.authProviderId, 'oauth', interaction)
        this.usage.invalidate()
        this.setAvailable(true)
      } finally {
        finishEnrollment()
      }
    })
    return flow.snapshot()
  }

  async state(id: string): Promise<BrowserOAuthState> {
    if (this.active?.id !== id) throw new HttpError(404, 'OAuth flow not found.')
    return this.active.snapshot()
  }

  respond(id: string, promptId: string, value: string): BrowserOAuthState {
    if (this.active?.id !== id) throw new HttpError(404, 'OAuth flow not found.')
    return this.active.respond(promptId, value)
  }

  cancel(id: string): BrowserOAuthState {
    if (this.active?.id !== id) throw new HttpError(404, 'OAuth flow not found.')
    return this.active.cancel()
  }

  async logout(): Promise<BrowserOAuthStatus> {
    this.active?.cancel()
    await this.models.logout(this.authProviderId)
    this.proxy.setActiveAccountProxyId(undefined)
    this.usage.invalidate()
    this.setAvailable(false)
    return this.status()
  }

  async configureProxy(value: string | null, scope: 'provider' | 'shared'): Promise<BrowserOAuthStatus> {
    this.assertProxyEditable()
    if (scope === 'shared') {
      if (value === null) await this.proxy.unsetShared()
      else await this.proxy.setShared(value)
    } else if (value === null) await this.proxy.unset()
    else await this.proxy.set(value)
    return this.status()
  }

  async promoteProxy(): Promise<BrowserOAuthStatus> {
    this.assertProxyEditable()
    await this.proxy.promoteToShared()
    return this.status()
  }

  async refreshSession(): Promise<BrowserOAuthStatus> {
    this.active?.cancel()
    this.active = undefined
    await this.proxy.refresh()
    const stored = await this.store.read(this.authProviderId)
    if (stored?.type !== 'oauth') {
      this.setAvailable(false)
      return this.status()
    }
    await this.models.getAuth(this.authProviderId)
    await this.models.refresh({ allowNetwork: true, force: true })
    this.setAvailable(true)
    return this.status()
  }

  async selectAccount(accountId: string): Promise<BrowserOAuthStatus> {
    this.active?.cancel()
    this.active = undefined
    await this.store.select(this.authProviderId, accountId)
    const accounts = await this.store.accounts(this.authProviderId)
    this.proxy.setActiveAccountProxyId(accounts.find(account => account.active)?.proxyId)
    this.usage.invalidate()
    await this.models.refresh({ allowNetwork: true, force: true })
    this.setAvailable(true)
    return this.status()
  }

  private assertProxyEditable(): void {
    if (this.active !== undefined && !this.active.isTerminal()) {
      throw new HttpError(409, 'Cancel the active sign-in before changing the proxy.')
    }
  }

  async addProxy(label: string, value: string): Promise<BrowserOAuthStatus> {
    this.assertProxyEditable()
    await this.proxy.add(label, value)
    return this.status()
  }

  async removeProxy(proxyId: string): Promise<BrowserOAuthStatus> {
    this.assertProxyEditable()
    await this.proxy.remove(proxyId)
    return this.status()
  }

  async makeDefaultProxy(proxyId: string): Promise<BrowserOAuthStatus> {
    this.assertProxyEditable()
    await this.proxy.makeDefault(proxyId)
    return this.status()
  }

  async assignProviderProxy(proxyId: string | undefined): Promise<BrowserOAuthStatus> {
    this.assertProxyEditable()
    await this.proxy.assignProvider(proxyId)
    return this.status()
  }

  async assignAccountProxy(accountId: string, proxyId: string | undefined): Promise<BrowserOAuthStatus> {
    this.assertProxyEditable()
    if (proxyId !== undefined && !this.proxy.has(proxyId)) throw new HttpError(400, 'Proxy not found.')
    await this.store.setProxy(this.authProviderId, accountId, proxyId)
    const accounts = await this.store.accounts(this.authProviderId)
    this.proxy.setActiveAccountProxyId(accounts.find(account => account.active)?.proxyId)
    this.usage.invalidate()
    return this.status()
  }

  async configureResetCredit(accountId: string, enabled: boolean): Promise<BrowserOAuthStatus> {
    if (this.authProviderId !== 'openai-codex') {
      throw new HttpError(400, 'Reset credits are available only for OpenAI Codex accounts.')
    }
    await this.store.setUseResetCredit(this.authProviderId, accountId, enabled)
    this.usage.invalidate()
    return this.status()
  }

  async setContextWindow(value: number): Promise<BrowserOAuthStatus> {
    if (this.contextWindow === undefined) {
      throw new HttpError(400, 'Context-window selection is available only for OpenAI Codex.')
    }
    await this.contextWindow.set(value)
    await this.publishContextWindow?.()
    return this.status()
  }

  async setAccountFailoverModel(accountId: string, modelId: string | undefined): Promise<BrowserOAuthStatus> {
    if (modelId !== undefined && !this.models.getModels(this.authProviderId).some(model => model.id === modelId)) {
      throw new HttpError(400, 'Failover model is not available for this provider.')
    }
    await this.store.setAccountFailoverModel(this.authProviderId, accountId, modelId)
    return this.status()
  }

  async setProviderFailoverModel(providerId: string, modelId: string | undefined): Promise<BrowserOAuthStatus> {
    if (this.failover === undefined || this.failoverRuntime === undefined) {
      throw new HttpError(503, 'Failover settings are unavailable.')
    }
    if (modelId !== undefined
      && !(await this.failoverRuntime.listModels(providerId)).some(model => model.id === modelId)) {
      throw new HttpError(400, 'Failover model is not available for this provider.')
    }
    await this.failover.setProviderModel(providerId, modelId)
    return this.status()
  }

  async setProviderFailoverEnabled(providerId: string, enabled: boolean): Promise<BrowserOAuthStatus> {
    if (this.failover === undefined || this.failoverRuntime === undefined) {
      throw new HttpError(503, 'Failover settings are unavailable.')
    }
    const detected = this.failoverRuntime.listProviders().map(provider => provider.id)
    if (!detected.includes(providerId)) throw new HttpError(400, 'Failover provider is not registered.')
    await this.failover.setProviderEnabled(providerId, enabled, detected)
    return this.status()
  }

  async setProviderFailoverOrder(order: readonly string[]): Promise<BrowserOAuthStatus> {
    if (this.failover === undefined || this.failoverRuntime === undefined) {
      throw new HttpError(503, 'Failover settings are unavailable.')
    }
    const detected = new Set(this.failoverRuntime.listProviders().map(provider => provider.id))
    if (order.some(provider => !detected.has(provider))) throw new HttpError(400, 'Failover order contains an unknown provider.')
    await this.failover.setProviderOrder(order)
    return this.status()
  }

  dispose(): void {
    this.active?.cancel()
  }
}

function requiredString(body: JsonRecord, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.length === 0) throw new HttpError(400, `${key} is required.`)
  return value
}

/** Register a same-origin Settings API when the Web profile supplies webServer. */
export function installBrowserOAuth(
  ctx: Context,
  models: Models,
  store: HarnessOAuthCredentialStore,
  proxy: ProviderProxySetting,
  usage: AccountUsageMonitor,
  authProviderId: string,
  providerName: string,
  route: string,
  setAvailable: (available: boolean) => void,
  contextWindow?: OpenAIContextWindowPreference,
  publishContextWindow?: () => Promise<void>,
  failover?: FailoverPreferences,
  failoverRuntime?: FailoverRuntime,
  availableFailoverRoutes?: () => ReadonlySet<string>,
): void {
  const prefix = `${API_ROOT}/${encodeURIComponent(route)}`
  ctx.inject(['webServer'], (webCtx) => {
    const controller = new BrowserOAuthController(
      models,
      store,
      proxy,
      usage,
      authProviderId,
      providerName,
      setAvailable,
      contextWindow,
      publishContextWindow,
      failover,
      failoverRuntime,
      availableFailoverRoutes,
    )
    webCtx.effect(() => {
      const disposeRoute = webCtx.webServer.register({
        kind: 'prefix',
        path: prefix,
        handler: async (req, res) => {
          try {
            const requestUrl = new URL(req.url ?? prefix, 'http://localhost')
            const action = requestUrl.pathname.slice(prefix.length) || '/status'
            const isHead = req.method === 'HEAD'
            if ((req.method === 'GET' || isHead) && action === '/status') {
              sendJson(res, 200, await controller.status(), isHead)
              return
            }
            if ((req.method === 'GET' || isHead) && action === '/state') {
              const flowId = requestUrl.searchParams.get('flowId')
              if (flowId === null) throw new HttpError(400, 'flowId is required.')
              sendJson(res, 200, await controller.state(flowId), isHead)
              return
            }
            if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
            if (!sameOrigin(req)) throw new HttpError(403, 'Same-origin request required.')
            const body = await readJson(req)
            if (action === '/start') {
              sendJson(res, 202, await controller.start())
              return
            }
            if (action === '/respond') {
              sendJson(res, 200, controller.respond(
                requiredString(body, 'flowId'),
                requiredString(body, 'promptId'),
                requiredString(body, 'value'),
              ))
              return
            }
            if (action === '/cancel') {
              sendJson(res, 200, controller.cancel(requiredString(body, 'flowId')))
              return
            }
            if (action === '/logout') {
              sendJson(res, 200, await controller.logout())
              return
            }
            if (action === '/refresh') {
              sendJson(res, 200, await controller.refreshSession())
              return
            }
            if (action === '/account/select') {
              sendJson(res, 200, await controller.selectAccount(requiredString(body, 'accountId')))
              return
            }
            if (action === '/account/reset-credit') {
              if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean.')
              sendJson(res, 200, await controller.configureResetCredit(
                requiredString(body, 'accountId'),
                body.enabled,
              ))
              return
            }
            if (action === '/context-window') {
              if (typeof body.value !== 'number' || !Number.isInteger(body.value)) {
                throw new HttpError(400, 'value must be an integer token count.')
              }
              sendJson(res, 200, await controller.setContextWindow(body.value))
              return
            }
            if (action === '/account/failover-model') {
              const modelId = body.modelId
              if (modelId !== null && typeof modelId !== 'string') {
                throw new HttpError(400, 'modelId must be a model id or null.')
              }
              sendJson(res, 200, await controller.setAccountFailoverModel(
                requiredString(body, 'accountId'),
                modelId === null ? undefined : modelId,
              ))
              return
            }
            if (action === '/failover/model') {
              const modelId = body.modelId
              if (modelId !== null && typeof modelId !== 'string') {
                throw new HttpError(400, 'modelId must be a model id or null.')
              }
              sendJson(res, 200, await controller.setProviderFailoverModel(
                requiredString(body, 'providerId'),
                modelId === null ? undefined : modelId,
              ))
              return
            }
            if (action === '/failover/enabled') {
              if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean.')
              sendJson(res, 200, await controller.setProviderFailoverEnabled(
                requiredString(body, 'providerId'),
                body.enabled,
              ))
              return
            }
            if (action === '/failover/order') {
              if (!Array.isArray(body.order) || body.order.some(entry => typeof entry !== 'string')) {
                throw new HttpError(400, 'order must be an array of provider ids.')
              }
              sendJson(res, 200, await controller.setProviderFailoverOrder(body.order as string[]))
              return
            }
            if (action === '/account/proxy') {
              const proxyId = body.proxyId
              if (proxyId !== null && typeof proxyId !== 'string') {
                throw new HttpError(400, 'proxyId must be a proxy id or null.')
              }
              sendJson(res, 200, await controller.assignAccountProxy(
                requiredString(body, 'accountId'),
                proxyId === null ? undefined : proxyId,
              ))
              return
            }
            if (action === '/proxy/entries/add') {
              sendJson(res, 200, await controller.addProxy(
                requiredString(body, 'label'),
                requiredString(body, 'value'),
              ))
              return
            }
            if (action === '/proxy/entries/remove') {
              sendJson(res, 200, await controller.removeProxy(requiredString(body, 'proxyId')))
              return
            }
            if (action === '/proxy/default') {
              sendJson(res, 200, await controller.makeDefaultProxy(requiredString(body, 'proxyId')))
              return
            }
            if (action === '/proxy/provider') {
              const proxyId = body.proxyId
              if (proxyId !== null && typeof proxyId !== 'string') {
                throw new HttpError(400, 'proxyId must be a proxy id or null.')
              }
              sendJson(res, 200, await controller.assignProviderProxy(proxyId === null ? undefined : proxyId))
              return
            }
            if (action === '/proxy') {
              const value = body.value
              if (value !== null && typeof value !== 'string') {
                throw new HttpError(400, 'value must be a proxy URL or null.')
              }
              const scope = body.scope === 'shared' ? 'shared' : 'provider'
              sendJson(res, 200, await controller.configureProxy(value, scope))
              return
            }
            if (action === '/proxy/promote') {
              sendJson(res, 200, await controller.promoteProxy())
              return
            }
            throw new HttpError(404, 'OAuth action not found.')
          } catch (error) {
            const status = error instanceof HttpError ? error.status : 400
            sendJson(res, status, { error: publicError(error) })
          }
        },
      })
      return () => {
        controller.dispose()
        disposeRoute()
      }
    }, `oauth-model-provider: ${route} Settings OAuth API`)
  })
}

export const browserOAuthApiRoot = API_ROOT
