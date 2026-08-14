import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Context as PiContext,
  Model,
  Provider,
  ProviderHeaders,
  SimpleStreamOptions,
  UserMessage,
} from '@earendil-works/pi-ai'

const DEFAULT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api'
const JWT_CLAIM_PATH = 'https://api.openai.com/auth'
const COMPACTION_PROMPT_PREFIX = 'You are now acting as a compaction engine for this AI coding assistant.'
const REMOTE_MARKER_PREFIX = '[[DSH_OPENAI_REMOTE_COMPACTION_V1:'
const REMOTE_MARKER_SUFFIX = ']]'
const REMOTE_MARKER_PATTERN = /\[\[DSH_OPENAI_REMOTE_COMPACTION_V1:([A-Za-z0-9_-]+)\]\]/u
const COMPACT_FIELDS = [
  'model',
  'input',
  'instructions',
  'tools',
  'parallel_tool_calls',
  'reasoning',
  'service_tier',
  'prompt_cache_key',
  'text',
] as const

class PayloadCaptured extends Error {}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function userText(message: UserMessage | undefined): string | undefined {
  if (message === undefined || message.role !== 'user') return undefined
  if (typeof message.content === 'string') return message.content
  return message.content
    .filter((block): block is { type: 'text', text: string } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

function compactionContext(context: PiContext): PiContext | undefined {
  const last = context.messages.at(-1)
  if (last?.role !== 'user' || !userText(last)?.startsWith(COMPACTION_PROMPT_PREFIX)) return undefined
  return { ...context, messages: context.messages.slice(0, -1) }
}

function encodeRemoteOutput(output: unknown[]): string {
  const bytes = deflateRawSync(Buffer.from(JSON.stringify(output), 'utf8'))
  return `${REMOTE_MARKER_PREFIX}${bytes.toString('base64url')}${REMOTE_MARKER_SUFFIX}`
}

function decodeRemoteOutput(value: string): unknown[] {
  const decoded = inflateRawSync(Buffer.from(value, 'base64url')).toString('utf8')
  const output: unknown = JSON.parse(decoded)
  if (!Array.isArray(output) || output.some(item => record(item) === undefined)) {
    throw new Error('OpenAI remote compaction marker contains an invalid output array')
  }
  return output
}

function markerOutput(value: unknown): unknown[] | undefined {
  const match = JSON.stringify(value).match(REMOTE_MARKER_PATTERN)
  if (match?.[1] === undefined) return undefined
  return decodeRemoteOutput(match[1])
}

/** Restore OpenAI's canonical opaque compaction items before the next request. */
export function restoreRemoteCompactionPayload(payload: unknown): unknown {
  const body = record(payload)
  if (body === undefined || !Array.isArray(body.input)) return payload
  let changed = false
  const input = body.input.flatMap((item): unknown[] => {
    const output = markerOutput(item)
    if (output === undefined) return [item]
    changed = true
    return output
  })
  return changed ? { ...body, input } : payload
}

/** Keep only fields accepted by the unary Responses compaction endpoint. */
export function compactRequestPayload(payload: unknown): Record<string, unknown> {
  const source = record(restoreRemoteCompactionPayload(payload))
  if (source === undefined || !Array.isArray(source.input)) {
    throw new Error('OpenAI Codex did not produce a compactable Responses payload')
  }
  const compact: Record<string, unknown> = {}
  for (const key of COMPACT_FIELDS) {
    if (source[key] !== undefined) compact[key] = source[key]
  }
  return compact
}

function payloadOptions(options: SimpleStreamOptions | undefined): SimpleStreamOptions {
  const prior = options?.onPayload
  return {
    ...options,
    onPayload: async (payload, model) => {
      const replaced = await prior?.(payload, model)
      return restoreRemoteCompactionPayload(replaced ?? payload)
    },
  }
}

async function capturePayload(
  base: Provider,
  model: Model<Api>,
  context: PiContext,
  options: SimpleStreamOptions,
): Promise<unknown> {
  let captured: unknown
  const prior = options.onPayload
  const source = base.streamSimple(model, context, {
    ...options,
    transport: 'sse',
    onPayload: async (payload, payloadModel) => {
      const replaced = await prior?.(payload, payloadModel)
      captured = replaced ?? payload
      throw new PayloadCaptured('Captured OpenAI Responses payload before network dispatch')
    },
  })
  await source.result()
  if (captured === undefined) throw new Error('Could not capture the OpenAI Responses payload')
  return captured
}

function resolveCompactUrl(baseUrl: string | undefined): string {
  const normalized = (baseUrl?.trim() || DEFAULT_CODEX_BASE_URL).replace(/\/+$/u, '')
  if (normalized.endsWith('/codex/responses')) return `${normalized}/compact`
  if (normalized.endsWith('/codex')) return `${normalized}/responses/compact`
  return `${normalized}/codex/responses/compact`
}

function accountId(token: string): string {
  try {
    const part = token.split('.')[1]
    if (part === undefined) throw new Error('invalid JWT')
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>
    const auth = record(payload[JWT_CLAIM_PATH])
    const id = auth?.chatgpt_account_id
    if (typeof id !== 'string' || id.length === 0) throw new Error('missing account id')
    return id
  } catch {
    throw new Error('Failed to extract the ChatGPT account id from the OAuth access token')
  }
}

function mergeHeaders(...sources: Array<ProviderHeaders | undefined>): Headers {
  const headers = new Headers()
  for (const source of sources) {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (value === null) headers.delete(key)
      else headers.set(key, value)
    }
  }
  return headers
}

async function remoteCompact(
  base: Provider,
  model: Model<Api>,
  payload: Record<string, unknown>,
  options: SimpleStreamOptions,
): Promise<unknown[]> {
  const token = options.apiKey
  if (token === undefined || token.length === 0) throw new Error('OpenAI OAuth access token is missing')
  const headers = mergeHeaders(base.headers, model.headers, options.headers)
  headers.set('authorization', `Bearer ${token}`)
  headers.set('chatgpt-account-id', accountId(token))
  headers.set('originator', 'dsh-oauth-model-providers')
  headers.set('OpenAI-Beta', 'responses=experimental')
  headers.set('accept', 'application/json')
  headers.set('content-type', 'application/json')
  if (options.sessionId !== undefined) {
    headers.set('session-id', options.sessionId)
    headers.set('x-client-request-id', options.sessionId)
  }
  const response = await fetch(resolveCompactUrl(model.baseUrl ?? base.baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })
  if (!response.ok) {
    const details = (await response.text()).slice(0, 1000)
    throw new Error(`OpenAI remote compaction failed (HTTP ${response.status}): ${details || response.statusText}`)
  }
  const value: unknown = await response.json()
  const output = record(value)?.output
  if (!Array.isArray(output) || output.some(item => record(item) === undefined)) {
    throw new Error('OpenAI remote compaction returned an invalid output array')
  }
  return output
}

function emptyUsage(): AssistantMessage['usage'] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function remoteMessage(model: Model<Api>, output: unknown[]): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: encodeRemoteOutput(output) }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: emptyUsage(),
    stopReason: 'stop',
    timestamp: Date.now(),
  }
}

function forward(source: AssistantMessageEventStream, target: AssistantMessageEventStream): Promise<void> {
  return (async () => {
    for await (const event of source) target.push(event)
    target.end(await source.result())
  })()
}

function compactingStream(
  base: Provider,
  model: Model<Api>,
  originalContext: PiContext,
  compactContext: PiContext,
  options: SimpleStreamOptions,
): AssistantMessageEventStream {
  const target = createAssistantMessageEventStream()
  void (async () => {
    try {
      const captured = await capturePayload(base, model, compactContext, options)
      const output = await remoteCompact(base, model, compactRequestPayload(captured), options)
      const message = remoteMessage(model, output)
      target.push({ type: 'start', partial: message })
      target.push({ type: 'done', reason: 'stop', message })
      target.end(message)
    } catch {
      // DSH's existing text-summary compaction remains the safe fallback when
      // the preview OAuth endpoint is unavailable or changes its protocol.
      await forward(base.streamSimple(model, originalContext, options), target)
    }
  })()
  return target
}

/** Add OpenAI's unary remote compaction while retaining DSH's local fallback. */
export function openAiRemoteCompactionProvider(base: Provider): Provider {
  if (base.id !== 'openai-codex') return base
  return {
    ...base,
    streamSimple: (model, context, rawOptions) => {
      const options = payloadOptions(rawOptions)
      const compact = compactionContext(context)
      return compact === undefined
        ? base.streamSimple(model, context, options)
        : compactingStream(base, model, context, compact, options)
    },
  }
}
