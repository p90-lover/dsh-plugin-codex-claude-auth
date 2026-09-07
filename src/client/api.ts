import { publicError } from '../public-error.ts'
import { PROVIDERS, providerEndpoint } from './contracts.ts'
import type { FlowState, ProviderId, ProviderSnapshot, ProviderStatus } from './contracts.ts'

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isStatus(value: unknown): value is ProviderStatus {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<ProviderStatus>
  return typeof item.connected === 'boolean' && Array.isArray(item.accounts)
    && item.accounts.every(a => record(a) && typeof a.id === 'string' && typeof a.label === 'string'
      && typeof a.active === 'boolean' && typeof a.useResetCredit === 'boolean' && record(a.usage)
      && (a.usage.windows === undefined || (Array.isArray(a.usage.windows) && a.usage.windows.every(record))))
    && Array.isArray(item.proxy?.entries) && item.proxy.entries.every(p => record(p) && typeof p.id === 'string' && typeof p.label === 'string' && typeof p.display === 'string')
    && Array.isArray(item.failover?.providers) && item.failover.providers.every(p => record(p)
      && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.models)
      && p.models.every(m => record(m) && typeof m.id === 'string' && typeof m.name === 'string'
        && Array.isArray(m.efforts) && m.efforts.every(e => record(e) && typeof e.id === 'string' && typeof e.name === 'string')))
    && (item.contextWindow === undefined || (record(item.contextWindow)
      && Number.isInteger(item.contextWindow.selected) && Number.isInteger(item.contextWindow.minimum)
      && Number.isInteger(item.contextWindow.maximum) && Array.isArray(item.contextWindow.options)
      && item.contextWindow.options.every(Number.isInteger) && record(item.contextWindow.modelLimits)))
}

/** One request owner for all plugin surfaces; stale reads never replace confirmed writes. */
export class ProviderService {
  private states: Record<ProviderId, ProviderSnapshot> = {
    codex: { loading: false, busy: false }, claude: { loading: false, busy: false },
  }
  private revisions: Record<ProviderId, number> = { codex: 0, claude: 0 }
  private reads = new Map<ProviderId, Promise<void>>()
  private queued = new Map<ProviderId, Promise<void>>()
  private listeners = new Set<() => void>()
  private abort = new AbortController()
  private disposed = false
  constructor(private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {}
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  snapshot = (id: ProviderId): ProviderSnapshot => this.states[id]
  private publish(id: ProviderId, state: ProviderSnapshot): void {
    if (this.disposed) return
    this.states = { ...this.states, [id]: state }
    for (const listener of this.listeners) listener()
  }
  private async request(id: ProviderId, action: string, body?: object): Promise<unknown> {
    const response = await this.fetcher(`${providerEndpoint(id)}${action}`, {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(30_000)]),
      ...(body === undefined ? {} : {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }),
    })
    let value: unknown
    try { value = await response.json() } catch { throw new Error(`HTTP ${response.status}: invalid JSON response.`) }
    if (!response.ok) {
      const error = typeof value === 'object' && value !== null && 'error' in value ? value.error : `HTTP ${response.status}`
      throw new Error(publicError(error))
    }
    return value
  }
  async load(id: ProviderId, force = false): Promise<void> {
    if (this.disposed || this.states[id].busy) return
    if (!force && this.states[id].data && Date.now() - (this.states[id].updatedAt ?? 0) < 5000) return
    const running = this.reads.get(id)
    if (running) {
      if (!force) return running
      const queued = this.queued.get(id)
      if (queued) return queued
      ++this.revisions[id]
      const refresh = running.then(() => this.load(id, true))
      this.queued.set(id, refresh)
      try { await refresh } finally { if (this.queued.get(id) === refresh) this.queued.delete(id) }
      return
    }
    const revision = this.revisions[id]
    const task = (async () => {
      this.publish(id, { ...this.states[id], loading: true })
      try {
        const value = await this.request(id, '/status')
        if (!isStatus(value)) throw new Error('Invalid provider status. Reload or check the installed plugin version.')
        if (revision === this.revisions[id]) this.publish(id, { data: value, loading: false, busy: false, updatedAt: Date.now() })
      } catch (error) {
        if (revision === this.revisions[id]) this.publish(id, { ...this.states[id], loading: false, error: publicError(error) })
      }
    })()
    this.reads.set(id, task)
    try { await task } finally { if (this.reads.get(id) === task) this.reads.delete(id) }
  }
  async refreshAll(): Promise<void> { await Promise.all(PROVIDERS.map(p => this.load(p.id, true))) }
  async mutate(id: ProviderId, action: string, body: object): Promise<ProviderStatus> {
    if (this.disposed) throw new Error('Provider control center has been closed.')
    if (this.states[id].busy) throw new Error('Another change is still being saved.')
    ++this.revisions[id]
    this.publish(id, { ...this.states[id], busy: true })
    try {
      const value = await this.request(id, action, body)
      if (!isStatus(value)) throw new Error('Invalid save acknowledgement. Refresh status before retrying.')
      this.publish(id, { data: value, busy: false, loading: false, updatedAt: Date.now() })
      // Shared proxy/failover state may also be visible through the other route.
      for (const other of PROVIDERS) if (other.id !== id && this.states[other.id].data) void this.load(other.id, true)
      return value
    } catch (error) {
      this.publish(id, { ...this.states[id], busy: false, loading: false })
      throw new Error(publicError(error))
    }
  }
  async flow(id: ProviderId, action: string, body?: object): Promise<FlowState> {
    const value = await this.request(id, action, body)
    if (typeof value !== 'object' || value === null || !('phase' in value) || !('id' in value)) throw new Error('Invalid sign-in response.')
    return value as FlowState
  }
  dispose(): void {
    this.disposed = true
    this.abort.abort()
    this.listeners.clear()
  }
}
