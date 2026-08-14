import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  Message,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { isConfirmedUsageExhaustion } from './account-usage.ts'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Repair replay metadata written by releases before routed stream identity was normalized. */
export function repairLegacyReplayMessages(
  messages: Message[],
  route: string,
  upstreamProvider: string,
): Message[] {
  let changed = false
  const repaired = messages.map((message): Message => {
    if (message.role !== 'assistant' || message.source.kind !== 'model') return message
    const state = record(message.source.replayState)
    if (state?.kind !== 'pi-ai'
      || state.version !== 1
      || state.provider !== upstreamProvider
      || state.model !== message.source.model
      || message.source.provider !== route) return message

    changed = true
    return {
      ...message,
      source: {
        ...message.source,
        replayState: { ...state, provider: route },
      },
    }
  })
  return changed ? repaired : messages
}

/** Delegate adapter that narrowly upgrades the plugin's one known legacy replay alias. */
export class ReplayCompatibleAdapter extends LlmAdapter {
  constructor(
    private readonly delegate: LlmAdapter,
    private readonly route: string,
    private readonly upstreamProvider: string,
  ) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return this.delegate.providerInfo(provider)
  }

  override providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined {
    return this.delegate.providerRetryPolicy(provider)
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return this.delegate.listModels(provider)
  }

  override resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    return this.delegate.resolveModel(provider, model, signal)
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.delegate.stream({
      ...options,
      messages: repairLegacyReplayMessages(options.messages, this.route, this.upstreamProvider),
    })
  }
}

export interface AccountSwitchResult {
  kind?: 'switch' | 'reset'
  from: { label: string }
  to: { label: string }
}

function shifted(chunk: StreamChunk): StreamChunk {
  if ('index' in chunk) return { ...chunk, index: chunk.index + 1 }
  return chunk
}

/** Retry once on a confirmed pre-output usage exhaustion and persist a visible switch block. */
export class AccountRotatingAdapter extends LlmAdapter {
  constructor(
    private readonly delegate: LlmAdapter,
    private readonly rotate: () => Promise<AccountSwitchResult | undefined>,
  ) { super() }

  override providerInfo(provider: string): LlmProviderInfo { return this.delegate.providerInfo(provider) }
  override providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined { return this.delegate.providerRetryPolicy(provider) }
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> { return this.delegate.listModels(provider) }
  override resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return this.delegate.resolveModel(provider, model, signal)
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    let emitted = false
    try {
      for await (const chunk of this.delegate.stream(options)) {
        emitted = true
        yield chunk
      }
      return
    } catch (error) {
      if (emitted || !isConfirmedUsageExhaustion(error)) throw error
      const switched = await this.rotate()
      if (switched === undefined) throw error
      const notice = switched.kind === 'reset'
        ? `An earned usage reset was applied automatically for ${switched.to.label}; the request is continuing on the same account.\n\n已自動為 ${switched.to.label} 使用已取得的用量重設額度；此請求會繼續使用相同帳戶。\n\n`
        : `Account switched automatically: ${switched.from.label} → ${switched.to.label} because the previous account reached its usage limit.\n\n已自動切換帳戶：${switched.from.label} → ${switched.to.label}，因為上一個帳戶已達使用上限。\n\n`
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: notice }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: notice } }
      for await (const chunk of this.delegate.stream(options)) yield shifted(chunk)
    }
  }
}
