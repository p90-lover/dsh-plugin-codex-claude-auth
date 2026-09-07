import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  PreparedAdapterCall,
  LlmImageRequestPricing,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  Message,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { HarnessCredentialBackend } from './credential-store.ts'

// This predicate is local because the baseline Harness does not export isTokenDelta.
function isTokenDelta(chunk: StreamChunk): boolean {
  if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') return chunk.text.length > 0
  if (chunk.type === 'tool-call-delta') return chunk.argumentsDelta.length > 0 || chunk.name !== undefined
  return false
}

const FAILOVER_REF = 'DSH_OAUTH_FAILOVER_CONFIG' as CredentialRef
const MAX_STICKY_SESSIONS = 256

interface StoredFailoverPreferences {
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
}

export interface PublicFailoverPreferences {
  providers: readonly FailoverProviderCatalog[]
}

export interface FailoverRuntime {
  listProviders(): LlmProviderInfo[]
  listConfigurableProviders?(): readonly { provider: string; displayName: string }[]
  listModels(provider: string): Promise<LlmModelInfo[]>
  resolveModel?(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

function emptyPreferences(): StoredFailoverPreferences {
  return {
    version: 1,
    providerOrder: [],
    enabledProviders: [],
    providerModels: {},
    providerEfforts: {},
  }
}

function parsePreferences(value: string | undefined): StoredFailoverPreferences {
  if (value === undefined) return emptyPreferences()
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (parsed.version !== 1) return emptyPreferences()
    const providerOrder = Array.isArray(parsed.providerOrder)
      ? parsed.providerOrder.filter((entry): entry is string => typeof entry === 'string')
      : []
    const enabledProviders = Array.isArray(parsed.enabledProviders)
      ? parsed.enabledProviders.filter((entry): entry is string => typeof entry === 'string')
      : []
    const models = typeof parsed.providerModels === 'object' && parsed.providerModels !== null
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
    }
  } catch {
    return emptyPreferences()
  }
}

function automaticMiddleModel(models: readonly { id: string; name?: string }[]): string | undefined {
  if (models.length === 0) return undefined
  const semanticMiddle = models.find((model) => {
    const value = `${model.id} ${model.name ?? ''}`
    return /(^|[-_.\s])(sonnet|terra|balanced|medium|standard|chat)([-_.\s]|$)/iu.test(value)
  })
  return (semanticMiddle ?? models[Math.floor(models.length / 2)])?.id
}

/** Durable provider order and provider-level model defaults shared by every OAuth route. */
export class FailoverPreferences {
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private readonly backend: HarnessCredentialBackend) {}

  private async readStored(): Promise<StoredFailoverPreferences> {
    const resolved = await this.backend.resolve(FAILOVER_REF)
    return parsePreferences(resolved?.value)
  }

  private update(operation: (current: StoredFailoverPreferences) => StoredFailoverPreferences): Promise<void> {
    const next = (async () => {
      await this.chain.catch(() => undefined)
      const current = await this.readStored()
      await this.backend.set(FAILOVER_REF, JSON.stringify(operation(current)))
    })()
    this.chain = next.catch(() => undefined)
    return next
  }

  async effectiveOrder(detectedProviders: readonly string[]): Promise<string[]> {
    const stored = await this.readStored()
    const detected = [...new Set(detectedProviders)]
    const ordered = [
      ...stored.providerOrder.filter(provider => detected.includes(provider)),
      ...detected.filter(provider => !stored.providerOrder.includes(provider)),
    ]
    return ordered.filter(provider => stored.enabledProviders.includes(provider))
  }

  async modelFor(provider: string, availableModels: readonly string[]): Promise<string | undefined> {
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

  setProviderEnabled(provider: string, enabled: boolean, detectedProviders: readonly string[]): Promise<void> {
    return this.update((current) => {
      const defaultEnabled = current.enabledProviders
      return {
        ...current,
        providerOrder: [
          ...current.providerOrder,
          ...detectedProviders.filter(entry => !current.providerOrder.includes(entry)),
        ],
        enabledProviders: enabled
          ? [...new Set([...defaultEnabled, provider])]
          : defaultEnabled.filter(entry => entry !== provider),
      }
    })
  }

  setProviderOrder(order: readonly string[]): Promise<void> {
    return this.update(current => ({
      ...current,
      providerOrder: [...new Set(order)],
      enabledProviders: current.enabledProviders,
    }))
  }

  setProviderModel(provider: string, model: string | undefined): Promise<void> {
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

  async describe(runtime: FailoverRuntime, availableRoutes: ReadonlySet<string>): Promise<PublicFailoverPreferences> {
    const active = runtime.listProviders()
    const providers = [
      ...active,
      ...(runtime.listConfigurableProviders?.() ?? [])
        .filter(entry => !active.some(provider => provider.id === entry.provider))
        .map(entry => ({ id: entry.provider, name: entry.displayName })),
    ]
    const detectedIds = providers.map(provider => provider.id)
    const stored = await this.readStored()
    const order = [
      ...stored.providerOrder.filter(provider => detectedIds.includes(provider)),
      ...detectedIds.filter(provider => !stored.providerOrder.includes(provider)),
    ]
    const enabled = new Set(stored.enabledProviders)
    const byId = new Map(providers.map(provider => [provider.id, provider]))
    const entries = await Promise.all(order.map(async (id): Promise<FailoverProviderCatalog> => {
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
    }))
    return { providers: entries }
  }
}

export interface AccountSwitchResult {
  kind?: 'switch' | 'reset'
  from: { label: string }
  to: { label: string }
}

interface OAuthRouteState {
  delegate: LlmAdapter
  displayName: string
  available: boolean
  rotate: () => Promise<AccountSwitchResult | undefined>
  selectModel: (models: readonly LlmModelInfo[]) => Promise<string | undefined>
  selectEffort?: (
    model: LlmResolvedModelInfo,
  ) => Promise<GenerateOptions['reasoningEffort'] | undefined>
}

interface StickyRoute {
  sourceProvider: string
  sourceModel: string
  targetProvider: string
  targetModel: string
}

class AttemptFailure extends Error {
  constructor(
    readonly causeValue: unknown,
    readonly usage?: Extract<StreamChunk, { type: 'usage' }>,
    readonly finish?: Extract<StreamChunk, { type: 'finish' }>,
  ) {
    super(causeValue instanceof Error ? causeValue.message : String(causeValue))
  }
}

function withoutForeignReplay(messages: Message[], provider: string, model: string): Message[] {
  let changed = false
  const projected = messages.map((message): Message => {
    if (message.role !== 'assistant' || message.source.kind !== 'model' || message.source.replayState === undefined) {
      return message
    }
    if (message.source.provider === provider && message.source.model === model) return message
    changed = true
    return {
      ...message,
      source: {
        kind: 'model',
        provider: message.source.provider,
        model: message.source.model,
      },
    }
  })
  return changed ? projected : messages
}

function indexed(chunk: StreamChunk, offset: number): StreamChunk {
  return 'index' in chunk ? { ...chunk, index: chunk.index + offset } : chunk
}

function retarget(options: GenerateOptions, provider: string, model: string): GenerateOptions {
  const { reasoningEffort: _removedEffort, maxTokens: _removedMaxTokens, ...rest } = options
  return { ...rest, provider, model }
}

function retryableFailure(error: AttemptFailure): boolean {
  const finish = error.finish
  if (finish?.reason.kind === 'aborted') return false
  const failure = finish?.reason.kind === 'error' ? finish.reason.failure : undefined
  const code = String(failure?.code ?? '').toUpperCase()
  const status = failure?.status
  const message = `${failure?.message ?? ''} ${error.message}`
  if (status === 400 || /INVALID|UNSUPPORTED|UNKNOWN_MODEL|CONTEXT|REPLAY|ABORT/u.test(code)) return false
  return status === 401 || status === 403 || status === 408 || status === 409 || status === 429
    || (status !== undefined && status >= 500)
    || /AUTH|CREDENTIAL|RATE_LIMIT|TIMEOUT|NETWORK/u.test(code)
    || /usage[_ -]?limit|quota|rate.?limit|not signed in|missing credential|unauthorized|forbidden|authentication|timeout|timed out|network|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|HTTP (?:401|403|408|409|429|5\d\d)/iu.test(message)
}

function switchNotice(from: string, to: string, model: string): string {
  return `Provider switched automatically: ${from} → ${to} using ${model}. The previous provider still failed after its account retry.\n\n已自動切換提供者：${from} → ${to}，使用 ${model}。上一個提供者在切換帳號重試後仍然失敗。\n\n`
}

function accountNotice(result: AccountSwitchResult, model: string): string {
  return result.kind === 'reset'
    ? `An earned usage reset was applied automatically for ${result.to.label}; retrying with ${model}.\n\n已自動為 ${result.to.label} 使用已取得的用量重設額度，並以 ${model} 重試。\n\n`
    : `Account switched automatically: ${result.from.label} → ${result.to.label}; retrying with ${model}.\n\n已自動切換帳號：${result.from.label} → ${result.to.label}，並以 ${model} 重試。\n\n`
}

/** One shared adapter that keeps manual and automatic route/model changes replay-safe. */
export class AutoFailoverAdapter extends LlmAdapter {
  private readonly routes = new Map<string, OAuthRouteState>()
  private readonly sticky = new Map<string, StickyRoute>()

  constructor(
    private readonly runtime: FailoverRuntime,
    private readonly preferences: FailoverPreferences,
  ) { super() }

  configureRoute(route: string, state: Omit<OAuthRouteState, 'available'>): void {
    this.routes.set(route, { ...state, available: false })
  }

  setAvailable(route: string, available: boolean): void {
    const state = this.routes.get(route)
    if (state !== undefined) state.available = available
  }

  availableRoutes(): ReadonlySet<string> {
    return new Set(this.runtime.listProviders().map(provider => provider.id).filter((route) => {
      const state = this.routes.get(route)
      return state === undefined || state.available
    }))
  }

  private rememberSticky(sessionKey: string, route: StickyRoute): void {
    this.sticky.delete(sessionKey)
    this.sticky.set(sessionKey, route)
    const oldest = this.sticky.keys().next().value as string | undefined
    if (this.sticky.size > MAX_STICKY_SESSIONS && oldest !== undefined) this.sticky.delete(oldest)
  }

  override providerInfo(provider: string): LlmProviderInfo {
    const state = this.routes.get(provider)
    if (state === undefined) throw new Error(`Failover adapter does not own provider ${provider}.`)
    return { id: provider, name: state.displayName }
  }

  override providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined {
    return this.routes.get(provider)?.delegate.providerRetryPolicy(provider)
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const state = this.routes.get(provider)
    if (state === undefined) return Promise.resolve([])
    return state.delegate.listModels(provider)
  }

  override resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    const state = this.routes.get(provider)
    if (state === undefined) return Promise.reject(new Error(`Failover adapter does not own provider ${provider}.`))
    return state.delegate.resolveModel(provider, model, signal)
  }

  override imageRequestPricing(provider: string, model: string): LlmImageRequestPricing | undefined {
    return this.routes.get(provider)?.delegate.imageRequestPricing(provider, model)
  }

  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const state = this.routes.get(provider)
    if (state === undefined) throw new Error('Provider is not registered.')
    const prepared = await state.delegate.prepareCall(provider, model, signal)
    return { model: prepared.model, stream: options => this.streamPrepared(options, prepared) }
  }

  private async selectedModel(provider: string): Promise<string | undefined> {
    const models = this.routes.has(provider)
      ? [...await this.routes.get(provider)!.delegate.listModels(provider)]
      : await this.runtime.listModels(provider)
    const own = this.routes.get(provider)
    return own === undefined
      ? this.preferences.modelFor(provider, models.map(model => model.id))
      : own.selectModel(models)
  }

  private streamFor(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.routes.get(options.provider)?.delegate.stream(options) ?? this.runtime.stream(options)
  }

  private async retargetRequest(options: GenerateOptions, provider: string, model: string): Promise<GenerateOptions> {
    const request = retarget(options, provider, model)
    const own = this.routes.get(provider)
    const info = own === undefined
      ? await this.runtime.resolveModel?.(provider, model, options.signal)
      : await own.delegate.resolveModel(provider, model, options.signal)
    if (info === undefined) return request
    const effortIds = info.reasoning?.efforts.map(effort => String(effort.id)) ?? []
    const selectedEffort = own === undefined
      ? await this.preferences.effortFor(provider, effortIds, info.reasoning?.defaultEffort)
      : own.selectEffort === undefined
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
  }

  private async *attempt(
    options: GenerateOptions,
    source: Pick<GenerateOptions, 'provider' | 'model'>,
    offset: number,
    prepared?: PreparedAdapterCall,
  ): AsyncIterable<StreamChunk> {
    let emitted = false
    const pending: StreamChunk[] = []
    let usage: Extract<StreamChunk, { type: 'usage' }> | undefined
    try {
      const request = {
        ...options,
        messages: withoutForeignReplay(options.messages, options.provider, options.model),
      }
      for await (const chunk of prepared === undefined ? this.streamFor(request) : prepared.stream(request)) {
        if (chunk.type === 'usage') {
          usage = chunk
          continue
        }
        if (chunk.type === 'finish') {
          if ((chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') && !emitted) {
            throw new AttemptFailure(chunk.reason.failure.message, usage, chunk)
          }
          for (const prefix of pending.splice(0)) yield indexed(prefix, offset)
          if (usage !== undefined) yield usage
          yield options.provider === source.provider && options.model === source.model
            ? chunk
            : { type: 'finish', reason: chunk.reason }
          return
        }
        // Empty block headers are provisional. Publishing them before a retry
        // would duplicate indices in the assembled response. A completed block
        // is committed output even when the provider emitted no deltas.
        if (isTokenDelta(chunk) || chunk.type === 'block-end') {
          emitted = true
          for (const prefix of pending.splice(0)) yield indexed(prefix, offset)
        }
        if (!emitted) {
          if (pending.length >= 1024) throw new Error('Provider emitted too many empty stream blocks.')
          pending.push(chunk)
        } else yield indexed(chunk, offset)
      }
    } catch (error) {
      if (error instanceof AttemptFailure || emitted) throw error
      throw new AttemptFailure(error)
    }
  }

  private async *terminal(error: AttemptFailure): AsyncIterable<StreamChunk> {
    if (error.finish === undefined) throw error.causeValue
    if (error.usage !== undefined) yield error.usage
    yield error.finish
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.streamPrepared(options)
  }

  private async *streamPrepared(options: GenerateOptions, prepared?: PreparedAdapterCall): AsyncIterable<StreamChunk> {
    const source = { provider: options.provider, model: options.model }
    const sessionKey = options.sessionId === undefined ? undefined : String(options.sessionId)
    let prior = sessionKey === undefined ? undefined : this.sticky.get(sessionKey)
    if (prior !== undefined) {
      const allowed = await this.preferences.effectiveOrder([...this.availableRoutes()])
      if (prior.sourceProvider !== options.provider || prior.sourceModel !== options.model
        || !this.availableRoutes().has(prior.targetProvider)
        || (prior.targetProvider !== source.provider && !allowed.includes(prior.targetProvider))) {
        this.sticky.delete(sessionKey!)
        prior = undefined
      }
    }
    let selected = prior !== undefined
      ? { provider: prior.targetProvider, model: prior.targetModel }
      : source
    let request: GenerateOptions = selected.provider === options.provider && selected.model === options.model
      ? options
      : await this.retargetRequest(options, selected.provider, selected.model)

    try {
      for await (const chunk of this.attempt(request, source, 0, selected.provider === source.provider && selected.model === source.model ? prepared : undefined)) yield chunk
      return
    } catch (firstError) {
      if (!(firstError instanceof AttemptFailure) || !retryableFailure(firstError)) throw firstError

      let offset = 0
      const own = this.routes.get(selected.provider)
      if (own !== undefined) {
        const switched = await own.rotate()
        if (switched !== undefined) {
          const model = await this.selectedModel(selected.provider) ?? selected.model
          selected = { provider: selected.provider, model }
          request = await this.retargetRequest(options, selected.provider, selected.model)
          const notice = accountNotice(switched, model)
          yield { type: 'block-start', index: offset, blockType: 'text' }
          yield { type: 'text-delta', index: offset, text: notice }
          yield { type: 'block-end', index: offset, block: { type: 'text', text: notice } }
          offset += 1
          try {
            for await (const chunk of this.attempt(request, source, offset)) yield chunk
            if (sessionKey !== undefined && (selected.provider !== source.provider || selected.model !== source.model)) {
              this.rememberSticky(sessionKey, {
                sourceProvider: source.provider, sourceModel: source.model,
                targetProvider: selected.provider, targetModel: selected.model,
              })
            }
            return
          } catch (retryError) {
            if (!(retryError instanceof AttemptFailure) || !retryableFailure(retryError)) throw retryError
            firstError = retryError
          }
        }
      }

      const detected = this.runtime.listProviders().map(provider => provider.id).filter((route) => {
        const state = this.routes.get(route)
        return state === undefined || state.available
      })
      const candidates = (await this.preferences.effectiveOrder(detected)).filter(route => route !== selected.provider)
      const targetProvider = candidates[0]
      const targetModel = targetProvider === undefined ? undefined : await this.selectedModel(targetProvider)
      if (targetProvider === undefined || targetModel === undefined) {
        yield* this.terminal(firstError as AttemptFailure)
        return
      }

      const notice = switchNotice(selected.provider, targetProvider, targetModel)
      yield { type: 'block-start', index: offset, blockType: 'text' }
      yield { type: 'text-delta', index: offset, text: notice }
      yield { type: 'block-end', index: offset, block: { type: 'text', text: notice } }
      offset += 1
      selected = { provider: targetProvider, model: targetModel }
      request = await this.retargetRequest(options, selected.provider, selected.model)
      try {
        for await (const chunk of this.attempt(request, source, offset)) yield chunk
        if (sessionKey !== undefined) {
          this.rememberSticky(sessionKey, {
            sourceProvider: source.provider, sourceModel: source.model,
            targetProvider, targetModel,
          })
        }
      } catch (targetError) {
        if (targetError instanceof AttemptFailure) yield* this.terminal(targetError)
        else throw targetError
      }
    }
  }
}
