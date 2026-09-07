import type {
  Api,
  Credential,
  Model,
  ModelThinkingLevel,
  Provider,
  RefreshModelsContext,
  ThinkingLevelMap,
} from '@earendil-works/pi-ai'

export type OAuthModelCatalog = 'openai-codex' | 'anthropic'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface RemoteModelFacts {
  id: string
  name: string
  contextWindow?: number
  maxTokens?: number
  input?: ('text' | 'image')[]
  reasoning?: boolean
  thinkingLevelMap?: ThinkingLevelMap
}

interface RemoteCatalog {
  notModified: boolean
  models?: RemoteModelFacts[]
  etag?: string
}

const CODEX_CLIENT_VERSION = '0.147.0'
const PLUGIN_VERSION = '0.7.4'
const REFRESH_TTL_MS = 15 * 60 * 1000
const REQUEST_TIMEOUT_MS = 20_000
const THINKING_LEVELS: readonly ModelThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]
const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function requestSignal(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

function providerUrl(baseUrl: string, path: string): URL {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
}

function responseError(provider: string, response: Response): Error {
  return new Error(`${provider} model discovery failed with HTTP ${response.status}`)
}

function inputModalities(value: unknown): ('text' | 'image')[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result = value.filter((entry): entry is 'text' | 'image' => entry === 'text' || entry === 'image')
  return result.length > 0 ? [...new Set(result)] : undefined
}

function thinkingMap(values: ReadonlyMap<ModelThinkingLevel, string>): ThinkingLevelMap {
  const result: ThinkingLevelMap = {}
  for (const level of THINKING_LEVELS) result[level] = values.get(level) ?? null
  return result
}

function openAIThinking(value: unknown): {
  reasoning: boolean
  map: ThinkingLevelMap
} | undefined {
  if (!Array.isArray(value)) return undefined
  const supported = new Map<ModelThinkingLevel, string>()
  for (const entry of value) {
    const effort = nonEmptyString(record(entry)?.effort)
    if (effort === undefined) continue
    const level = effort === 'none' ? 'off' : effort
    if (THINKING_LEVELS.includes(level as ModelThinkingLevel)) {
      supported.set(level as ModelThinkingLevel, effort)
    }
  }
  return { reasoning: supported.size > 0, map: thinkingMap(supported) }
}

function openAIModels(value: unknown): RemoteModelFacts[] {
  const rows = record(value)?.models
  if (!Array.isArray(rows)) throw new Error('OpenAI Codex model discovery returned an invalid catalog')
  const result: RemoteModelFacts[] = []
  for (const value of rows) {
    const row = record(value)
    const id = nonEmptyString(row?.slug)
    if (row === undefined || id === undefined) continue
    if (row.visibility === 'hide' || row.visibility === 'none') continue
    const thinking = openAIThinking(row.supported_reasoning_levels)
    const name = nonEmptyString(row.display_name) ?? id
    const contextWindow = positiveNumber(row.context_window) ?? positiveNumber(row.max_context_window)
    const maxTokens = positiveNumber(row.max_output_tokens)
    const input = inputModalities(row.input_modalities)
    result.push({
      id,
      name,
      ...contextWindow === undefined ? {} : { contextWindow },
      ...maxTokens === undefined ? {} : { maxTokens },
      ...input === undefined ? {} : { input },
      ...thinking === undefined
        ? {}
        : { reasoning: thinking.reasoning, thinkingLevelMap: thinking.map },
    })
  }
  if (result.length === 0) throw new Error('OpenAI Codex model discovery returned no selectable models')
  return result
}

function capabilitySupported(value: unknown): boolean | undefined {
  const supported = record(value)?.supported
  return typeof supported === 'boolean' ? supported : undefined
}

function anthropicThinking(capabilities: Record<string, unknown> | undefined): {
  reasoning: boolean
  map?: ThinkingLevelMap
} | undefined {
  if (capabilities === undefined) return undefined
  const thinking = capabilitySupported(capabilities.thinking)
  const effort = record(capabilities.effort)
  const effortSupported = typeof effort?.supported === 'boolean' ? effort.supported : undefined
  if (thinking === undefined && effortSupported === undefined) return undefined
  const reasoning = thinking === true || effortSupported === true
  if (!reasoning || effortSupported !== true || effort === undefined) return { reasoning }

  const supported = new Map<ModelThinkingLevel, string>([['off', 'off']])
  for (const level of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
    if (capabilitySupported(effort[level]) === true) supported.set(level, level)
  }
  return { reasoning, map: thinkingMap(supported) }
}

function anthropicModels(rows: unknown[]): RemoteModelFacts[] {
  const result: RemoteModelFacts[] = []
  for (const value of rows) {
    const row = record(value)
    const id = nonEmptyString(row?.id)
    if (row === undefined || id === undefined || row.type !== 'model') continue
    const capabilities = record(row.capabilities)
    const thinking = anthropicThinking(capabilities)
    const imageInput = capabilitySupported(capabilities?.image_input)
    const input = imageInput === undefined
      ? undefined
      : imageInput ? ['text', 'image'] as const : ['text'] as const
    const contextWindow = positiveNumber(row.max_input_tokens)
    const maxTokens = positiveNumber(row.max_tokens)
    result.push({
      id,
      name: nonEmptyString(row.display_name) ?? id,
      ...contextWindow === undefined ? {} : { contextWindow },
      ...maxTokens === undefined ? {} : { maxTokens },
      ...input === undefined ? {} : { input: [...input] },
      ...thinking === undefined ? {} : { reasoning: thinking.reasoning },
      ...thinking?.map === undefined ? {} : { thinkingLevelMap: thinking.map },
    })
  }
  if (result.length === 0) throw new Error('Anthropic model discovery returned no models')
  return result
}

function openAIAccountId(credential: Extract<Credential, { type: 'oauth' }>): string {
  const stored = nonEmptyString(credential.accountId)
  if (stored !== undefined) return stored
  try {
    const payloadPart = credential.access.split('.')[1]
    if (payloadPart === undefined) throw new Error('missing JWT payload')
    const payload = record(JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')))
    const auth = record(payload?.['https://api.openai.com/auth'])
    const accountId = nonEmptyString(auth?.chatgpt_account_id)
    if (accountId !== undefined) return accountId
  } catch {
    // Use one non-secret error below for every malformed token shape.
  }
  throw new Error('OpenAI Codex model discovery could not resolve the ChatGPT account id')
}

async function fetchOpenAI(
  base: Provider,
  credential: Extract<Credential, { type: 'oauth' }>,
  fetch: Fetch,
  etag: string | undefined,
  signal: AbortSignal | undefined,
): Promise<RemoteCatalog> {
  const baseUrl = base.baseUrl ?? 'https://chatgpt.com/backend-api'
  const url = providerUrl(baseUrl, 'codex/models')
  url.searchParams.set('client_version', CODEX_CLIENT_VERSION)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${credential.access}`,
      'chatgpt-account-id': openAIAccountId(credential),
      originator: 'pi',
      version: CODEX_CLIENT_VERSION,
      'user-agent': `dsh-oauth-model-providers/${PLUGIN_VERSION}`,
      ...etag === undefined ? {} : { 'if-none-match': etag },
    },
    signal: requestSignal(signal),
  })
  if (response.status === 304) return { notModified: true }
  if (!response.ok) throw responseError('OpenAI Codex', response)
  const responseEtag = response.headers.get('etag') ?? undefined
  return {
    notModified: false,
    models: openAIModels(await response.json()),
    ...responseEtag === undefined ? {} : { etag: responseEtag },
  }
}

async function fetchAnthropic(
  base: Provider,
  credential: Extract<Credential, { type: 'oauth' }>,
  fetch: Fetch,
  signal: AbortSignal | undefined,
): Promise<RemoteCatalog> {
  const baseUrl = base.baseUrl ?? 'https://api.anthropic.com'
  const rows: unknown[] = []
  let afterId: string | undefined
  for (let page = 0; page < 20; page += 1) {
    const url = providerUrl(baseUrl, 'v1/models')
    url.searchParams.set('limit', '100')
    if (afterId !== undefined) url.searchParams.set('after_id', afterId)
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credential.access}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
        'anthropic-dangerous-direct-browser-access': 'true',
        'user-agent': 'claude-cli/2.1.75',
        'x-app': 'cli',
      },
      signal: requestSignal(signal),
    })
    if (!response.ok) throw responseError('Anthropic', response)
    const body = record(await response.json())
    if (!Array.isArray(body?.data)) throw new Error('Anthropic model discovery returned an invalid page')
    rows.push(...body.data)
    if (body.has_more !== true) break
    afterId = nonEmptyString(body.last_id)
    if (afterId === undefined) throw new Error('Anthropic model discovery returned an invalid pagination cursor')
  }
  return { notModified: false, models: anthropicModels(rows) }
}

function templateFor(id: string, fallback: readonly Model<Api>[]): Model<Api> | undefined {
  const exact = fallback.find(model => model.id === id)
  if (exact !== undefined) return exact
  const families = ['opus', 'sonnet', 'haiku', 'codex', 'spark', 'sol', 'terra', 'luna', 'mini', 'nano']
  const family = families.find(value => id.toLowerCase().includes(value))
  return family === undefined
    ? fallback[0]
    : fallback.find(model => model.id.toLowerCase().includes(family)) ?? fallback[0]
}

function materializeModels(
  facts: RemoteModelFacts[],
  fallback: readonly Model<Api>[],
  provider: Provider,
): Model<Api>[] {
  return facts.map((remote): Model<Api> => {
    const template = templateFor(remote.id, fallback)
    if (template === undefined) throw new Error(`${provider.name} has no model template for discovery`)
    const exact = template.id === remote.id
    const { thinkingLevelMap: templateThinking, ...templateFields } = template
    const reasoning = remote.reasoning ?? template.reasoning
    const resolvedThinking = reasoning
      ? remote.thinkingLevelMap ?? templateThinking
      : undefined
    return {
      ...templateFields,
      id: remote.id,
      name: remote.name,
      provider: provider.id,
      baseUrl: provider.baseUrl ?? template.baseUrl,
      reasoning,
      input: remote.input ?? [...template.input],
      cost: exact ? template.cost : ZERO_COST,
      contextWindow: remote.contextWindow ?? template.contextWindow,
      maxTokens: remote.maxTokens ?? template.maxTokens,
      ...resolvedThinking === undefined ? {} : { thinkingLevelMap: resolvedThinking },
    }
  })
}

/** Provider-owned catalog with effective capacity kept separate from native capability. */
export interface DiscoveredOAuthProvider extends Provider {
  nativeModels(): readonly Model<Api>[]
}

/** Generation-checked discovery; rejected or cancelled publications cannot change the visible catalog. */
export function autoModelProvider(
  base: Provider,
  catalog: OAuthModelCatalog,
  fetch: Fetch = (input, init) => globalThis.fetch(input, init),
  contextWindowOverride?: () => number | undefined,
): DiscoveredOAuthProvider {
  const fallback = [...base.getModels()]
  let models: readonly Model<Api>[] = fallback
  const visibleModels = (): readonly Model<Api>[] => {
    const selected = contextWindowOverride?.()
    return selected === undefined ? models : models.map(model => ({
      ...model,
      contextWindow: Math.min(selected, model.contextWindow),
    }))
  }
  return {
    ...base,
    nativeModels: () => models,
    getModels: visibleModels,
    refreshModels: async (context: RefreshModelsContext): Promise<void> => {
      const stored = context.stored
      const cached = stored?.models.filter(model => model.provider === base.id) ?? []
      if (context.signal.aborted) return
      if (cached.length > 0) {
        const accepted = await context.publish({ update: () => { models = cached } })
        if (!accepted) return
      }
      if (!context.allowNetwork || context.signal.aborted || context.credential?.type !== 'oauth') return
      if (!context.force && stored?.checkedAt !== undefined && Date.now() - stored.checkedAt < REFRESH_TTL_MS) return
      const remote = catalog === 'openai-codex'
        ? await fetchOpenAI(base, context.credential, fetch, stored?.etag, context.signal)
        : await fetchAnthropic(base, context.credential, fetch, context.signal)
      if (context.signal.aborted) return
      if (remote.notModified) {
        if (cached.length === 0) throw new Error(`${base.name} returned 304 without a cached model catalog`)
        await context.publish({ persist: {
          models: [...cached], checkedAt: Date.now(),
          ...stored?.etag === undefined ? {} : { etag: stored.etag },
        } })
        return
      }
      if (remote.models === undefined) throw new Error(`${base.name} returned no model catalog`)
      const next = materializeModels(remote.models, fallback, base)
      await context.publish({
        persist: { models: [...next], checkedAt: Date.now(), ...remote.etag === undefined ? {} : { etag: remote.etag } },
        update: () => { models = next },
      })
    },
  }
}
