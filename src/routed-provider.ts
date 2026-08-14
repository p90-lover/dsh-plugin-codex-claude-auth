import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import type {
  Api,
  ApiKeyAuth,
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Model,
  Provider,
  SimpleStreamOptions,
  ThinkingLevel,
} from '@earendil-works/pi-ai'

function explicitTokenAuth(name: string): ApiKeyAuth {
  return {
    name: `${name} OAuth access token`,
    resolve: ({ credential }) => Promise.resolve(credential?.key === undefined
      ? undefined
      : { auth: { apiKey: credential.key }, source: 'Harness OAuth store' }),
  }
}

function withProvider(model: Model<Api>, provider: string): Model<Api> {
  return { ...model, provider }
}

function payloadRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function wireEffort(model: Model<Api>, level: ThinkingLevel): string {
  const mapped = model.thinkingLevelMap?.[level]
  if (typeof mapped === 'string') return mapped
  if (model.provider === 'anthropic') {
    if (level === 'minimal') return 'low'
    if (level === 'max') return 'high'
  }
  return level
}

/** Enforce the selected effort in each provider's final request JSON. */
export function enforceReasoningPayload(
  payload: unknown,
  model: Model<Api>,
  reasoning: ThinkingLevel | undefined,
): unknown {
  if (reasoning === undefined) return payload
  const body = payloadRecord(payload)
  if (body === undefined) return payload
  const effort = wireEffort(model, reasoning)
  if (model.provider === 'openai-codex') {
    const existing = payloadRecord(body.reasoning)
    return {
      ...body,
      reasoning: { ...existing, effort, summary: existing?.summary ?? 'auto' },
    }
  }
  const compat = model.compat as { forceAdaptiveThinking?: boolean } | undefined
  if (model.provider === 'anthropic' && compat?.forceAdaptiveThinking === true) {
    const thinking = payloadRecord(body.thinking)
    const output = payloadRecord(body.output_config)
    return {
      ...body,
      thinking: { ...thinking, type: 'adaptive', display: thinking?.display ?? 'summarized' },
      output_config: { ...output, effort },
    }
  }
  return payload
}

function reasoningOptions(model: Model<Api>, options: SimpleStreamOptions | undefined): SimpleStreamOptions | undefined {
  if (options?.reasoning === undefined) return options
  const prior = options.onPayload
  return {
    ...options,
    onPayload: async (payload, payloadModel) => {
      const replaced = await prior?.(payload, payloadModel)
      return enforceReasoningPayload(replaced ?? payload, model, options.reasoning)
    },
  }
}

function routedMessage(message: AssistantMessage, route: string): AssistantMessage {
  return message.provider === route ? message : { ...message, provider: route }
}

function routedEvent(event: AssistantMessageEvent, route: string): AssistantMessageEvent {
  if (event.type === 'done') return { ...event, message: routedMessage(event.message, route) }
  if (event.type === 'error') return { ...event, error: routedMessage(event.error, route) }
  return { ...event, partial: routedMessage(event.partial, route) }
}

function failedMessage(model: Model<Api>, route: string, error: unknown): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: route,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'error',
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  }
}

/** Keep pi-ai's emitted/replay identity aligned with the public Harness route. */
function routedStream(
  source: AssistantMessageEventStream,
  model: Model<Api>,
  route: string,
): AssistantMessageEventStream {
  const target = createAssistantMessageEventStream()
  void (async () => {
    try {
      for await (const event of source) target.push(routedEvent(event, route))
      target.end(routedMessage(await source.result(), route))
    } catch (error) {
      const message = failedMessage(model, route, error)
      target.push({ type: 'error', reason: 'error', error: message })
      target.end(message)
    }
  })()
  return target
}

/**
 * Re-key a pi-ai provider for one Harness route. The wrapped request restores
 * the upstream provider id before dispatch, while auth accepts the access token
 * that the separate OAuth-aware Models collection resolved and refreshed.
 */
export function routedProvider(base: Provider, route: string, displayName: string): Provider {
  const routeModel = (model: Model<Api>): Model<Api> => withProvider(model, route)
  const baseModel = (model: Model<Api>): Model<Api> => withProvider(model, base.id)
  return {
    id: route,
    name: displayName,
    ...base.baseUrl === undefined ? {} : { baseUrl: base.baseUrl },
    ...base.headers === undefined ? {} : { headers: base.headers },
    auth: {
      ...base.auth,
      apiKey: explicitTokenAuth(displayName),
    },
    getModels: () => base.getModels().map(routeModel),
    ...base.filterModels === undefined
      ? {}
      : {
          filterModels: (models, credential) => base.filterModels?.(models.map(baseModel), credential)
            .map(routeModel) ?? [],
        },
    stream: (model, context, options) => routedStream(
      base.stream(baseModel(model), context, options),
      model,
      route,
    ),
    streamSimple: (model, context, options) => routedStream(
      base.streamSimple(baseModel(model), context, reasoningOptions(baseModel(model), options)),
      model,
      route,
    ),
  }
}
