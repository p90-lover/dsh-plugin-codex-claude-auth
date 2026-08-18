import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

function read(path) { return readFileSync(path, 'utf8') }
function write(path, content) {
  const slash = path.lastIndexOf('/')
  if (slash >= 0) mkdirSync(path.slice(0, slash), { recursive: true })
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
}
function replaceOnce(path, before, after) {
  const source = read(path)
  const count = source.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one replacement, found ${count}`)
  writeFileSync(path, source.replace(before, after), 'utf8')
}

write('src/context-window.ts', `import type { HarnessOAuthCredentialStore } from './credential-store.ts'

export const DEFAULT_OPENAI_CONTEXT_WINDOW = 252_000
export const MIN_OPENAI_CONTEXT_WINDOW = 252_000
export const MAX_OPENAI_CONTEXT_WINDOW = 1_000_000
export const OPENAI_CONTEXT_WINDOW_OPTIONS = [252_000, 353_000, 500_000, 1_000_000] as const
export const OPENAI_AUTO_COMPACT_RATIO = 0.9

export interface ContextWindowStatus {
  selected: number
  options: readonly number[]
  minimum: number
  maximum: number
  autoCompactAt: number
}

function supported(value: number): boolean {
  return Number.isInteger(value)
    && value >= MIN_OPENAI_CONTEXT_WINDOW
    && value <= MAX_OPENAI_CONTEXT_WINDOW
}

/** Credential-backed effective OpenAI context capacity shared by catalog publication and Settings. */
export class OpenAIContextWindowPreference {
  private selected = DEFAULT_OPENAI_CONTEXT_WINDOW

  constructor(private readonly store: HarnessOAuthCredentialStore) {}

  get value(): number {
    return this.selected
  }

  async load(): Promise<void> {
    const stored = await this.store.contextWindow('openai-codex')
    if (stored !== undefined && supported(stored)) this.selected = stored
  }

  status(): ContextWindowStatus {
    return {
      selected: this.selected,
      options: [...OPENAI_CONTEXT_WINDOW_OPTIONS],
      minimum: MIN_OPENAI_CONTEXT_WINDOW,
      maximum: MAX_OPENAI_CONTEXT_WINDOW,
      autoCompactAt: Math.floor(this.selected * OPENAI_AUTO_COMPACT_RATIO),
    }
  }

  async set(value: number): Promise<void> {
    if (!supported(value)) {
      throw new Error(
        \`OpenAI context window must be an integer between \${MIN_OPENAI_CONTEXT_WINDOW} and \${MAX_OPENAI_CONTEXT_WINDOW}.\`,
      )
    }
    await this.store.setContextWindow('openai-codex', value)
    this.selected = value
  }
}
`)

write('src/client/provider-usage.ts', `export type ComposerProviderId = 'codex' | 'claude'

export function providerIdFromRoute(route: string | undefined): ComposerProviderId | undefined {
  if (route === undefined) return undefined
  if (route === 'openai-codex-oauth' || route === 'openai-codex') return 'codex'
  if (route === 'anthropic-oauth' || route === 'anthropic') return 'claude'
  return undefined
}

export function latestProviderFromNodes(nodes: readonly unknown[]): ComposerProviderId | undefined {
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]
    if (typeof node !== 'object' || node === null || Array.isArray(node)) continue
    const record = node as Record<string, unknown>
    if (record.kind !== 'assistant') continue
    const provenance = record.provenance
    if (typeof provenance !== 'object' || provenance === null || Array.isArray(provenance)) continue
    const provider = (provenance as Record<string, unknown>).provider
    if (typeof provider !== 'string') continue
    const mapped = providerIdFromRoute(provider)
    if (mapped !== undefined) return mapped
  }
  return undefined
}

export function remainingPercent(remaining: number | undefined, used: number | undefined): number {
  const candidate = Number.isFinite(remaining)
    ? remaining!
    : Number.isFinite(used)
      ? 100 - used!
      : 100
  return Math.round(Math.max(0, Math.min(100, candidate)))
}

export function formatContextWindow(value: number): string {
  if (value === 1_000_000) return '1M'
  if (value % 1_000 === 0) return \`\${value / 1_000}K\`
  return value.toLocaleString('en-US')
}

export function isPresetContextWindow(value: number, options: readonly number[]): boolean {
  return options.includes(value)
}
`)

replaceOnce('src/failover.ts', `interface StoredFailoverPreferences {
  version: 1
  providerOrder: string[]
  enabledProviders: string[]
  providerModels: Record<string, string>
}

export interface FailoverProviderCatalog {
  id: string
  name: string
  available: boolean
  enabled: boolean
  models: readonly { id: string; name: string }[]
  defaultModel?: string
  model?: string
}`, `interface StoredFailoverPreferences {
  version: 1
  providerOrder: string[]
  enabledProviders: string[]
  providerModels: Record<string, string>
  providerEfforts: Record<string, string>
}

export interface FailoverProviderCatalog {
  id: string
  name: string
  available: boolean
  enabled: boolean
  models: readonly {
    id: string
    name: string
    efforts: readonly { id: string; name: string; description?: string }[]
    defaultEffort?: string
  }[]
  defaultModel?: string
  model?: string
  effort?: string
}`)

replaceOnce('src/failover.ts', `  listModels(provider: string): Promise<LlmModelInfo[]>
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>`, `  listModels(provider: string): Promise<LlmModelInfo[]>
  resolveModel?(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>`)

replaceOnce('src/failover.ts', `function emptyPreferences(): StoredFailoverPreferences {
  return { version: 1, providerOrder: [], enabledProviders: [], providerModels: {} }
}`, `function emptyPreferences(): StoredFailoverPreferences {
  return {
    version: 1,
    providerOrder: [],
    enabledProviders: [],
    providerModels: {},
    providerEfforts: {},
  }
}`)

replaceOnce('src/failover.ts', `    const models = typeof parsed.providerModels === 'object' && parsed.providerModels !== null
      ? parsed.providerModels as Record<string, unknown>
      : {}
    return {
      version: 1,
      providerOrder: [...new Set(providerOrder)],
      enabledProviders: [...new Set(enabledProviders)],
      providerModels: Object.fromEntries(Object.entries(models).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
      )),
    }`, `    const models = typeof parsed.providerModels === 'object' && parsed.providerModels !== null
      ? parsed.providerModels as Record<string, unknown>
      : {}
    const efforts = typeof parsed.providerEfforts === 'object' && parsed.providerEfforts !== null
      ? parsed.providerEfforts as Record<string, unknown>
      : {}
    return {
      version: 1,
      providerOrder: [...new Set(providerOrder)],
      enabledProviders: [...new Set(enabledProviders)],
      providerModels: Object.fromEntries(Object.entries(models).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
      )),
      providerEfforts: Object.fromEntries(Object.entries(efforts).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
      )),
    }`)

replaceOnce('src/failover.ts', `  async modelFor(provider: string, availableModels: readonly string[]): Promise<string | undefined> {
    if (availableModels.length === 0) return undefined
    const stored = await this.readStored()
    const configured = stored.providerModels[provider]
    return configured !== undefined && availableModels.includes(configured)
      ? configured
      : automaticMiddleModel(availableModels.map(id => ({ id })))
  }

  setProviderEnabled`, `  async modelFor(provider: string, availableModels: readonly string[]): Promise<string | undefined> {
    if (availableModels.length === 0) return undefined
    const stored = await this.readStored()
    const configured = stored.providerModels[provider]
    return configured !== undefined && availableModels.includes(configured)
      ? configured
      : automaticMiddleModel(availableModels.map(id => ({ id })))
  }

  async effortFor(
    provider: string,
    availableEfforts: readonly string[],
    modelDefault?: GenerateOptions['reasoningEffort'],
  ): Promise<GenerateOptions['reasoningEffort'] | undefined> {
    const stored = await this.readStored()
    const configured = stored.providerEfforts[provider]
    if (configured !== undefined && availableEfforts.includes(configured)) {
      return configured as GenerateOptions['reasoningEffort']
    }
    return modelDefault
  }

  setProviderEnabled`)

replaceOnce('src/failover.ts', `  setProviderModel(provider: string, model: string | undefined): Promise<void> {
    return this.update((current) => {
      const providerModels = { ...current.providerModels }
      if (model === undefined) delete providerModels[provider]
      else providerModels[provider] = model
      return { ...current, providerModels }
    })
  }

  async describe`, `  setProviderModel(provider: string, model: string | undefined): Promise<void> {
    return this.update((current) => {
      const providerModels = { ...current.providerModels }
      if (model === undefined) delete providerModels[provider]
      else providerModels[provider] = model
      return { ...current, providerModels }
    })
  }

  setProviderEffort(provider: string, effort: string | undefined): Promise<void> {
    return this.update((current) => {
      const providerEfforts = { ...current.providerEfforts }
      if (effort === undefined) delete providerEfforts[provider]
      else providerEfforts[provider] = effort
      return { ...current, providerEfforts }
    })
  }

  async describe`)

replaceOnce('src/failover.ts', `    const entries = await Promise.all(order.map(async (id): Promise<FailoverProviderCatalog> => {
      const models = await runtime.listModels(id).catch(() => [])
      const defaultModel = automaticMiddleModel(models)
      return {
        id,
        name: byId.get(id)?.name ?? id,
        available: availableRoutes.has(id) && models.length > 0,
        enabled: enabled.has(id),
        models: models.map(model => ({ id: model.id, name: model.name })),
        ...defaultModel === undefined ? {} : { defaultModel },
        ...stored.providerModels[id] === undefined ? {} : { model: stored.providerModels[id] },
      }
    }))`, `    const entries = await Promise.all(order.map(async (id): Promise<FailoverProviderCatalog> => {
      const models = await runtime.listModels(id).catch(() => [])
      const defaultModel = automaticMiddleModel(models)
      const modelEntries = await Promise.all(models.map(async (model) => {
        let resolved: LlmResolvedModelInfo | undefined
        if (runtime.resolveModel !== undefined) {
          resolved = await runtime.resolveModel(id, model.id).catch(() => undefined)
        }
        return {
          id: model.id,
          name: model.name,
          efforts: resolved?.reasoning?.efforts.map(effort => ({
            id: String(effort.id),
            name: effort.name,
            ...effort.description === undefined ? {} : { description: effort.description },
          })) ?? [],
          ...resolved?.reasoning?.defaultEffort === undefined
            ? {}
            : { defaultEffort: String(resolved.reasoning.defaultEffort) },
        }
      }))
      return {
        id,
        name: byId.get(id)?.name ?? id,
        available: availableRoutes.has(id) && models.length > 0,
        enabled: enabled.has(id),
        models: modelEntries,
        ...defaultModel === undefined ? {} : { defaultModel },
        ...stored.providerModels[id] === undefined ? {} : { model: stored.providerModels[id] },
        ...stored.providerEfforts[id] === undefined ? {} : { effort: stored.providerEfforts[id] },
      }
    }))`)

replaceOnce('src/failover.ts', `  rotate: () => Promise<AccountSwitchResult | undefined>
  selectModel: (models: readonly LlmModelInfo[]) => Promise<string | undefined>
}`, `  rotate: () => Promise<AccountSwitchResult | undefined>
  selectModel: (models: readonly LlmModelInfo[]) => Promise<string | undefined>
  selectEffort: (
    model: LlmResolvedModelInfo,
  ) => Promise<GenerateOptions['reasoningEffort'] | undefined>
}`)

replaceOnce('src/failover.ts', `  private async retargetRequest(options: GenerateOptions, provider: string, model: string): Promise<GenerateOptions> {
    const request = retarget(options, provider, model)
    const own = this.routes.get(provider)
    if (own === undefined) return request
    const info = await own.delegate.resolveModel(provider, model, options.signal)
    return {
      ...request,
      ...info.defaultMaxTokens === undefined ? {} : { maxTokens: info.defaultMaxTokens },
      ...info.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: info.reasoning.defaultEffort },
    }
  }`, `  private async retargetRequest(options: GenerateOptions, provider: string, model: string): Promise<GenerateOptions> {
    const request = retarget(options, provider, model)
    const own = this.routes.get(provider)
    const info = own === undefined
      ? await this.runtime.resolveModel?.(provider, model, options.signal)
      : await own.delegate.resolveModel(provider, model, options.signal)
    if (info === undefined) return request
    const effortIds = info.reasoning?.efforts.map(effort => String(effort.id)) ?? []
    const selectedEffort = own === undefined
      ? await this.preferences.effortFor(provider, effortIds, info.reasoning?.defaultEffort)
      : await own.selectEffort(info)
    const reasoningEffort = selectedEffort !== undefined
      && (effortIds.length === 0 || effortIds.includes(String(selectedEffort)))
      ? selectedEffort
      : info.reasoning?.defaultEffort
    return {
      ...request,
      ...info.defaultMaxTokens === undefined ? {} : { maxTokens: info.defaultMaxTokens },
      ...reasoningEffort === undefined ? {} : { reasoningEffort },
    }
  }`)

replaceOnce('src/credential-store.ts', `  useResetCredit?: boolean
  failoverModel?: string
}`, `  useResetCredit?: boolean
  failoverModel?: string
  failoverEffort?: string
}`)
replaceOnce('src/credential-store.ts', `  useResetCredit: boolean
  failoverModel?: string
}`, `  useResetCredit: boolean
  failoverModel?: string
  failoverEffort?: string
}`)
replaceOnce('src/credential-store.ts', `          ...typeof item.failoverModel === 'string' && item.failoverModel.length > 0
            ? { failoverModel: item.failoverModel }
            : {},`, `          ...typeof item.failoverModel === 'string' && item.failoverModel.length > 0
            ? { failoverModel: item.failoverModel }
            : {},
          ...typeof item.failoverEffort === 'string' && item.failoverEffort.length > 0
            ? { failoverEffort: item.failoverEffort }
            : {},`)
replaceOnce('src/credential-store.ts', `          ...matching >= 0 && bundle.accounts[matching]!.failoverModel !== undefined
            ? { failoverModel: bundle.accounts[matching]!.failoverModel }
            : {},`, `          ...matching >= 0 && bundle.accounts[matching]!.failoverModel !== undefined
            ? { failoverModel: bundle.accounts[matching]!.failoverModel }
            : {},
          ...matching >= 0 && bundle.accounts[matching]!.failoverEffort !== undefined
            ? { failoverEffort: bundle.accounts[matching]!.failoverEffort }
            : {},`)
replaceOnce('src/credential-store.ts', `      ...account.failoverModel === undefined ? {} : { failoverModel: account.failoverModel },
    }))`, `      ...account.failoverModel === undefined ? {} : { failoverModel: account.failoverModel },
      ...account.failoverEffort === undefined ? {} : { failoverEffort: account.failoverEffort },
    }))`)

replaceOnce('src/credential-store.ts', `  async failoverDefaultModel(providerId: string): Promise<string | undefined> {`, `  setAccountFailoverEffort(providerId: string, accountId: string, effortId: string | undefined): Promise<void> {
    const ref = this.ref(providerId)
    return this.enqueue(providerId, async () => {
      const resolved = await this.backend.resolve(ref)
      if (resolved === undefined) throw new Error('No OAuth accounts are saved.')
      const bundle = parseStoredValue(resolved.value, providerId, ref)
      if (!bundle.accounts.some(account => account.id === accountId)) throw new Error('OAuth account not found.')
      await this.backend.set(ref, JSON.stringify({
        ...bundle,
        accounts: bundle.accounts.map((account) => {
          if (account.id !== accountId) return account
          if (effortId === undefined) {
            const { failoverEffort: _removed, ...rest } = account
            return rest
          }
          return { ...account, failoverEffort: effortId }
        }),
      }))
    })
  }

  async failoverDefaultModel(providerId: string): Promise<string | undefined> {`)

replaceOnce('src/credential-store.ts', `  async contextWindow(providerId: string): Promise<number | undefined> {`, `  async resolveActiveFailoverEffort(
    providerId: string,
    availableEfforts: readonly string[],
    providerDefault?: string,
    modelDefault?: string,
  ): Promise<string | undefined> {
    const ref = this.refs.get(providerId)
    if (ref === undefined) return providerDefault ?? modelDefault
    const resolved = await this.backend.resolve(ref)
    if (resolved === undefined) return providerDefault ?? modelDefault
    const bundle = parseStoredValue(resolved.value, providerId, ref)
    const active = bundle.accounts.find(account => account.id === bundle.activeAccountId)
    const selected = active?.failoverEffort ?? providerDefault ?? modelDefault
    return selected !== undefined && (availableEfforts.length === 0 || availableEfforts.includes(selected))
      ? selected
      : modelDefault
  }

  async contextWindow(providerId: string): Promise<number | undefined> {`)

replaceOnce('src/credential-store.ts', `        ...account.failoverModel === undefined ? {} : { failoverModel: account.failoverModel },
      },`, `        ...account.failoverModel === undefined ? {} : { failoverModel: account.failoverModel },
        ...account.failoverEffort === undefined ? {} : { failoverEffort: account.failoverEffort },
      },`)

replaceOnce('src/browser-auth.ts', `  async setProviderFailoverModel(providerId: string, modelId: string | undefined): Promise<BrowserOAuthStatus> {`, `  async setAccountFailoverEffort(accountId: string, effortId: string | undefined): Promise<BrowserOAuthStatus> {
    await this.store.setAccountFailoverEffort(this.authProviderId, accountId, effortId)
    return this.status()
  }

  async setProviderFailoverModel(providerId: string, modelId: string | undefined): Promise<BrowserOAuthStatus> {`)
replaceOnce('src/browser-auth.ts', `  async setProviderFailoverEnabled(providerId: string, enabled: boolean): Promise<BrowserOAuthStatus> {`, `  async setProviderFailoverEffort(providerId: string, effortId: string | undefined): Promise<BrowserOAuthStatus> {
    if (this.failover === undefined || this.failoverRuntime === undefined) {
      throw new HttpError(503, 'Failover settings are unavailable.')
    }
    await this.failover.setProviderEffort(providerId, effortId)
    return this.status()
  }

  async setProviderFailoverEnabled(providerId: string, enabled: boolean): Promise<BrowserOAuthStatus> {`)
replaceOnce('src/browser-auth.ts', `            if (action === '/failover/model') {`, `            if (action === '/account/failover-effort') {
              const effortId = body.effortId
              if (effortId !== null && typeof effortId !== 'string') {
                throw new HttpError(400, 'effortId must be a reasoning effort id or null.')
              }
              sendJson(res, 200, await controller.setAccountFailoverEffort(
                requiredString(body, 'accountId'),
                effortId === null ? undefined : effortId,
              ))
              return
            }
            if (action === '/failover/model') {`)
replaceOnce('src/browser-auth.ts', `            if (action === '/failover/enabled') {`, `            if (action === '/failover/effort') {
              const effortId = body.effortId
              if (effortId !== null && typeof effortId !== 'string') {
                throw new HttpError(400, 'effortId must be a reasoning effort id or null.')
              }
              sendJson(res, 200, await controller.setProviderFailoverEffort(
                requiredString(body, 'providerId'),
                effortId === null ? undefined : effortId,
              ))
              return
            }
            if (action === '/failover/enabled') {`)

replaceOnce('src/provider-plugin.ts', `    selectModel: async (models) => {
      const ids = models.map(model => model.id)
      const providerDefault = await failover.preferences.modelFor(config.route, ids)
      return store.resolveActiveFailoverModel(spec.authProviderId, ids, providerDefault)
    },`, `    selectModel: async (models) => {
      const ids = models.map(model => model.id)
      const providerDefault = await failover.preferences.modelFor(config.route, ids)
      return store.resolveActiveFailoverModel(spec.authProviderId, ids, providerDefault)
    },
    selectEffort: async (model) => {
      const efforts = model.reasoning?.efforts.map(effort => String(effort.id)) ?? []
      const modelDefault = model.reasoning?.defaultEffort === undefined
        ? undefined
        : String(model.reasoning.defaultEffort)
      const providerDefault = await failover.preferences.effortFor(
        config.route,
        efforts,
        model.reasoning?.defaultEffort,
      )
      const selected = await store.resolveActiveFailoverEffort(
        spec.authProviderId,
        efforts,
        providerDefault === undefined ? undefined : String(providerDefault),
        modelDefault,
      )
      return selected as typeof model.reasoning.defaultEffort
    },`)
replaceOnce('src/provider-plugin.ts', `      await authModels.refresh({ allowNetwork: false, force: false })
      if (routeAvailable) registration.replace([config.route])`, `      await authModels.refresh({ allowNetwork: false, force: true })
      if (routeAvailable) registration.replace([config.route])`)
