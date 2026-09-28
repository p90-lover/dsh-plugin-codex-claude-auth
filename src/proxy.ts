import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { Provider, ProviderEnv, StreamOptions } from '@earendil-works/pi-ai'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { ProxyAgent } from 'undici'
import type { Dispatcher } from 'undici'
import type { HarnessCredentialBackend } from './credential-store.ts'

const PROXY_RUNTIME = Symbol.for('dsh.oauth-model-providers.proxy-runtime.v1')
const LOOPBACK = new Set(['127.0.0.1', '::1', '[::1]', 'localhost'])
const registryChains = new Map<string, Promise<unknown>>()

interface ProxyFetchInit extends RequestInit {
  dispatcher?: Dispatcher
}

interface ProxyRuntime {
  scope: AsyncLocalStorage<string>
  originalFetch: typeof globalThis.fetch
  agents: Map<string, ProxyAgent>
}

type GlobalWithProxyRuntime = typeof globalThis & {
  [PROXY_RUNTIME]?: ProxyRuntime
}

interface StoredProxyEntry {
  id: string
  label: string
  url: string
}

interface StoredProxyRegistry {
  version: 1
  proxies: StoredProxyEntry[]
}

interface StoredProviderAssignment {
  version: 1
  proxyId?: string
}

export interface PublicProxyEntry {
  id: string
  label: string
  display: string
  default: boolean
}

export interface PublicProxySetting {
  configured: boolean
  display?: string
  source?: 'account' | 'provider' | 'default'
  providerConfigured: boolean
  sharedConfigured: boolean
  entries: readonly PublicProxyEntry[]
  defaultProxyId?: string
  providerProxyId?: string
  activeAccountProxyId?: string
}

/** Validate and normalize one HTTP(S) forward-proxy URL. */
export function normalizeProxyUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error('Enter an HTTP or HTTPS proxy URL.')
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('The proxy URL is invalid.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS proxy URLs are supported. SOCKS and PAC URLs are not supported.')
  }
  if (parsed.hostname.length === 0) throw new Error('The proxy URL must include a host.')
  if (parsed.pathname !== '/' || parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new Error('The proxy URL must not include a path, query, or fragment.')
  }
  return parsed.toString()
}

/** Render a proxy target without ever returning embedded credentials. */
export function proxyDisplayName(value: string): string {
  const parsed = new URL(value)
  const host = parsed.hostname
  return `${parsed.protocol}//${host}${parsed.port.length > 0 ? `:${parsed.port}` : ''}`
}

function proxyLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const label = value.trim()
  if (label.length === 0) return fallback
  return label.slice(0, 80)
}

function parseRegistry(value: string | undefined): { registry: StoredProxyRegistry; migrated: boolean } {
  if (value === undefined) return { registry: { version: 1, proxies: [] }, migrated: false }
  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      if (record.version === 1 && Array.isArray(record.proxies)) {
        const seen = new Set<string>()
        let migrated = false
        const proxies = record.proxies.flatMap((entry, index): StoredProxyEntry[] => {
          if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return []
          const item = entry as Record<string, unknown>
          if (typeof item.url !== 'string') return []
          const url = normalizeProxyUrl(item.url)
          const id = typeof item.id === 'string' && item.id.length > 0
            ? item.id
            : `proxy-${randomUUID()}`
          if (typeof item.id !== 'string' || item.id.length === 0) migrated = true
          if (seen.has(id)) return []
          seen.add(id)
          return [{ id, label: proxyLabel(item.label, `Proxy ${index + 1}`), url }]
        })
        return { registry: { version: 1, proxies }, migrated }
      }
    }
  } catch {
    // A pre-0.7 value is one raw proxy URL, handled below.
  }
  const url = normalizeProxyUrl(value)
  return {
    registry: { version: 1, proxies: [{ id: `proxy-${randomUUID()}`, label: 'Proxy 1', url }] },
    migrated: true,
  }
}

function parseProviderAssignment(value: string | undefined): { proxyId?: string; legacyUrl?: string } {
  if (value === undefined) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      if (record.version === 1) {
        return typeof record.proxyId === 'string' && record.proxyId.length > 0
          ? { proxyId: record.proxyId }
          : {}
      }
    }
  } catch {
    // A pre-0.7 value is one raw provider proxy URL, handled below.
  }
  return { legacyUrl: normalizeProxyUrl(value) }
}

function serializeRegistry<T>(ref: CredentialRef, operation: () => Promise<T>): Promise<T> {
  const key = String(ref)
  const previous = registryChains.get(key) ?? Promise.resolve()
  const next = (async () => {
    await previous.catch(() => undefined)
    return operation()
  })()
  registryChains.set(key, next.catch(() => undefined))
  return next
}

function proxyRuntime(): ProxyRuntime {
  const shared = globalThis as GlobalWithProxyRuntime
  const existing = shared[PROXY_RUNTIME]
  if (existing !== undefined) return existing

  const scope = new AsyncLocalStorage<string>()
  const originalFetch = globalThis.fetch.bind(globalThis)
  const agents = new Map<string, ProxyAgent>()
  const runtime: ProxyRuntime = { scope, originalFetch, agents }
  shared[PROXY_RUNTIME] = runtime

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const proxy = scope.getStore()
    if (proxy === undefined) return originalFetch(input, init)

    const target = input instanceof Request ? new URL(input.url) : new URL(String(input))
    if (LOOPBACK.has(target.hostname.toLowerCase())) return originalFetch(input, init)

    let dispatcher = agents.get(proxy)
    if (dispatcher === undefined) {
      dispatcher = new ProxyAgent(proxy)
      agents.set(proxy, dispatcher)
    }
    return originalFetch(input, { ...init, dispatcher } as ProxyFetchInit)
  }) as typeof globalThis.fetch

  return runtime
}

/** Run synchronous or asynchronous provider work inside its isolated proxy context. */
export function withProviderProxy<T>(proxy: string | undefined, operation: () => T): T {
  if (proxy === undefined) return operation()
  return proxyRuntime().scope.run(proxy, operation)
}

function proxyOptions<T extends StreamOptions>(options: T | undefined, proxy: string): T {
  const env: ProviderEnv = {
    ...options?.env,
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    NO_PROXY: 'localhost,127.0.0.1,::1',
  }
  return {
    ...options,
    env,
    // Node WebSocket does not accept a per-request dispatcher. SSE keeps the
    // whole provider request on the scoped, proxy-aware fetch path.
    transport: 'sse',
  } as T
}

/** Wrap OAuth login/refresh and model streams with one live provider proxy. */
export function proxyAwareProvider(base: Provider, getProxy: () => string | undefined): Provider {
  const oauth = base.auth.oauth
  return {
    ...base,
    auth: {
      ...base.auth,
      ...oauth === undefined
        ? {}
        : {
            oauth: {
              ...oauth,
              login: interaction => withProviderProxy(getProxy(), () => oauth.login(interaction)),
              refresh: (credential, signal) => withProviderProxy(
                getProxy(),
                () => oauth.refresh(credential, signal),
              ),
            },
        },
    },
    ...base.refreshModels === undefined
      ? {}
      : {
          refreshModels: context => withProviderProxy(
            getProxy(),
            () => base.refreshModels!(context),
          ),
        },
    stream: (model, context, options) => {
      const proxy = getProxy()
      return withProviderProxy(
        proxy,
        () => base.stream(model, context, proxy === undefined ? options : proxyOptions(options, proxy)),
      )
    },
    streamSimple: (model, context, options) => {
      const proxy = getProxy()
      return withProviderProxy(
        proxy,
        () => base.streamSimple(model, context, proxy === undefined ? options : proxyOptions(options, proxy)),
      )
    },
  }
}

/** Secret-backed live proxy setting shared by OAuth and model dispatch. */
export class ProviderProxySetting {
  private entries: StoredProxyEntry[] = []
  private providerProxyId: string | undefined
  private activeAccountProxyId: string | undefined
  private loading: Promise<void> | undefined

  constructor(
    private readonly backend: HarnessCredentialBackend,
    readonly ref: CredentialRef,
    readonly sharedRef: CredentialRef,
    readonly providerId = 'provider',
  ) {}

  get value(): string | undefined {
    return this.valueForAssignment(this.activeAccountProxyId)
  }

  valueForAssignment(proxyId: string | undefined): string | undefined {
    return this.entries.find(entry => entry.id === proxyId)?.url
      ?? this.entries.find(entry => entry.id === this.providerProxyId)?.url
      ?? this.entries[0]?.url
  }

  setActiveAccountProxyId(proxyId: string | undefined): void {
    this.activeAccountProxyId = proxyId
  }

  has(proxyId: string): boolean {
    return this.entries.some(entry => entry.id === proxyId)
  }

  async refresh(): Promise<void> {
    const loading = this.loading ?? this.read()
    this.loading = loading
    try {
      await loading
    } finally {
      if (this.loading === loading) this.loading = undefined
    }
  }

  private async read(): Promise<void> {
    await serializeRegistry(this.sharedRef, async () => {
      const [provider, shared] = await Promise.all([
        this.backend.resolve(this.ref),
        this.backend.resolve(this.sharedRef),
      ])
      const parsed = parseRegistry(shared?.value)
      const assignment = parseProviderAssignment(provider?.value)
      const entries = [...parsed.registry.proxies]
      let providerProxyId = assignment.proxyId
      let migratedProvider = false
      if (assignment.legacyUrl !== undefined) {
        const existing = entries.find(entry => entry.url === assignment.legacyUrl)
        providerProxyId = existing?.id ?? `proxy-${randomUUID()}`
        if (existing === undefined) {
          entries.push({
            id: providerProxyId,
            label: `${this.providerId} proxy`,
            url: assignment.legacyUrl,
          })
        }
        migratedProvider = true
      }
      if (parsed.migrated || migratedProvider) {
        await this.backend.set(this.sharedRef, JSON.stringify({ version: 1, proxies: entries } satisfies StoredProxyRegistry))
      }
      if (migratedProvider && providerProxyId !== undefined) {
        await this.backend.set(this.ref, JSON.stringify({ version: 1, proxyId: providerProxyId } satisfies StoredProviderAssignment))
      }
      this.entries = entries
      this.providerProxyId = providerProxyId
    })
  }

  async add(label: string, value: string): Promise<string> {
    const normalized = normalizeProxyUrl(value)
    const name = proxyLabel(label, `Proxy ${this.entries.length + 1}`)
    const id = await serializeRegistry(this.sharedRef, async () => {
      const current = parseRegistry((await this.backend.resolve(this.sharedRef))?.value).registry
      const existing = current.proxies.find(entry => entry.url === normalized)
      if (existing !== undefined) return existing.id
      const proxyId = `proxy-${randomUUID()}`
      await this.backend.set(this.sharedRef, JSON.stringify({
        version: 1,
        proxies: [...current.proxies, { id: proxyId, label: name, url: normalized }],
      } satisfies StoredProxyRegistry))
      return proxyId
    })
    await this.refresh()
    return id
  }

  async remove(proxyId: string): Promise<void> {
    await serializeRegistry(this.sharedRef, async () => {
      const current = parseRegistry((await this.backend.resolve(this.sharedRef))?.value).registry
      if (!current.proxies.some(entry => entry.id === proxyId)) throw new Error('Proxy not found.')
      await this.backend.set(this.sharedRef, JSON.stringify({
        version: 1,
        proxies: current.proxies.filter(entry => entry.id !== proxyId),
      } satisfies StoredProxyRegistry))
    })
    if (this.providerProxyId === proxyId) await this.assignProvider(undefined)
    await this.refresh()
  }

  async assignProvider(proxyId: string | undefined): Promise<void> {
    await this.refresh()
    if (proxyId !== undefined && !this.has(proxyId)) throw new Error('Proxy not found.')
    if (proxyId === undefined) await this.backend.unset(this.ref)
    else await this.backend.set(this.ref, JSON.stringify({ version: 1, proxyId } satisfies StoredProviderAssignment))
    this.providerProxyId = proxyId
  }

  async makeDefault(proxyId: string): Promise<void> {
    await serializeRegistry(this.sharedRef, async () => {
      const current = parseRegistry((await this.backend.resolve(this.sharedRef))?.value).registry
      const selected = current.proxies.find(entry => entry.id === proxyId)
      if (selected === undefined) throw new Error('Proxy not found.')
      await this.backend.set(this.sharedRef, JSON.stringify({
        version: 1,
        proxies: [selected, ...current.proxies.filter(entry => entry.id !== proxyId)],
      } satisfies StoredProxyRegistry))
    })
    await this.refresh()
  }

  /** Pre-0.7 compatibility: save and select one provider proxy. */
  async set(value: string): Promise<void> {
    const id = await this.add(`${this.providerId} proxy`, value)
    await this.assignProvider(id)
  }

  async unset(): Promise<void> {
    await this.assignProvider(undefined)
  }

  /** Pre-0.7 compatibility: add one shared proxy and make it the first/default entry. */
  async setShared(value: string): Promise<void> {
    const id = await this.add('Shared proxy', value)
    await this.makeDefault(id)
  }

  async unsetShared(): Promise<void> {
    const first = this.entries[0]
    if (first !== undefined) await this.remove(first.id)
  }

  /** Pre-0.7 compatibility: make the assigned provider proxy the list default. */
  async promoteToShared(): Promise<void> {
    await this.refresh()
    if (this.providerProxyId === undefined || !this.has(this.providerProxyId)) {
      throw new Error('No provider proxy is saved to reuse.')
    }
    await this.makeDefault(this.providerProxyId)
  }

  describe(): PublicProxySetting {
    const value = this.value
    const accountAssigned = this.activeAccountProxyId !== undefined && this.has(this.activeAccountProxyId)
    const providerAssigned = this.providerProxyId !== undefined && this.has(this.providerProxyId)
    const providerProxyId = providerAssigned ? this.providerProxyId : undefined
    const activeAccountProxyId = accountAssigned ? this.activeAccountProxyId : undefined
    return {
      configured: value !== undefined,
      ...(value === undefined ? {} : { display: proxyDisplayName(value) }),
      ...(accountAssigned
        ? { source: 'account' as const }
        : providerAssigned
          ? { source: 'provider' as const }
          : value === undefined ? {} : { source: 'default' as const }),
      providerConfigured: providerAssigned,
      sharedConfigured: this.entries.length > 0,
      entries: this.entries.map((entry, index) => ({
        id: entry.id,
        label: entry.label,
        display: proxyDisplayName(entry.url),
        default: index === 0,
      })),
      ...(this.entries[0] === undefined ? {} : { defaultProxyId: this.entries[0].id }),
      ...(providerProxyId === undefined ? {} : { providerProxyId }),
      ...(activeAccountProxyId === undefined ? {} : { activeAccountProxyId }),
    }
  }
}
