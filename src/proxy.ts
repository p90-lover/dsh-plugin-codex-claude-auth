import { AsyncLocalStorage } from 'node:async_hooks'
import type { Provider, ProviderEnv, StreamOptions } from '@earendil-works/pi-ai'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { ProxyAgent } from 'undici'
import type { Dispatcher } from 'undici'
import type { HarnessCredentialBackend } from './credential-store.ts'

const PROXY_RUNTIME = Symbol.for('dsh.oauth-model-providers.proxy-runtime.v1')
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost'])

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
  const host = parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname
  return `${parsed.protocol}//${host}${parsed.port.length > 0 ? `:${parsed.port}` : ''}`
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
  private providerCurrent: string | undefined
  private sharedCurrent: string | undefined
  private loading: Promise<void> | undefined

  constructor(
    private readonly backend: HarnessCredentialBackend,
    readonly ref: CredentialRef,
    readonly sharedRef: CredentialRef,
  ) {}

  get value(): string | undefined {
    return this.sharedCurrent ?? this.providerCurrent
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
    const [provider, shared] = await Promise.all([
      this.backend.resolve(this.ref),
      this.backend.resolve(this.sharedRef),
    ])
    this.providerCurrent = provider === undefined ? undefined : normalizeProxyUrl(provider.value)
    this.sharedCurrent = shared === undefined ? undefined : normalizeProxyUrl(shared.value)
  }

  async set(value: string): Promise<void> {
    const normalized = normalizeProxyUrl(value)
    await this.backend.set(this.ref, normalized)
    this.providerCurrent = normalized
  }

  async unset(): Promise<void> {
    await this.backend.unset(this.ref)
    this.providerCurrent = undefined
  }

  async setShared(value: string): Promise<void> {
    const normalized = normalizeProxyUrl(value)
    await this.backend.set(this.sharedRef, normalized)
    this.sharedCurrent = normalized
  }

  async unsetShared(): Promise<void> {
    await this.backend.unset(this.sharedRef)
    this.sharedCurrent = undefined
  }

  /** Copy a provider-only secret to the shared ref without exposing it to the client. */
  async promoteToShared(): Promise<void> {
    await this.refresh()
    if (this.providerCurrent === undefined) throw new Error('No provider proxy is saved to reuse.')
    await this.backend.set(this.sharedRef, this.providerCurrent)
    this.sharedCurrent = this.providerCurrent
  }

  describe(): {
    configured: boolean
    display?: string
    source?: 'shared' | 'provider'
    providerConfigured: boolean
    sharedConfigured: boolean
  } {
    const value = this.value
    return {
      configured: value !== undefined,
      ...(value === undefined ? {} : { display: proxyDisplayName(value) }),
      ...(this.sharedCurrent !== undefined ? { source: 'shared' as const } : this.providerCurrent !== undefined ? { source: 'provider' as const } : {}),
      providerConfigured: this.providerCurrent !== undefined,
      sharedConfigured: this.sharedCurrent !== undefined,
    }
  }
}
