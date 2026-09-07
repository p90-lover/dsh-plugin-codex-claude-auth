import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  Provider,
  SimpleStreamOptions,
} from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compactRequestPayload,
  openAiRemoteCompactionProvider,
} from '../src/remote-compaction.ts'

const COMPACTION_PROMPT = 'You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE.'

function selectedModel(): Model<Api> {
  return {
    id: 'gpt-test',
    name: 'GPT Test',
    api: 'openai-codex-responses',
    provider: 'openai-codex',
    baseUrl: 'https://chatgpt.com/backend-api',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 100_000,
    maxTokens: 4096,
  }
}

function message(text: string, stopReason: AssistantMessage['stopReason'] = 'stop'): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-codex-responses',
    provider: 'openai-codex',
    model: 'gpt-test',
    usage: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: Date.now(),
    ...(stopReason === 'error' ? { errorMessage: text } : {}),
  }
}

function fakeStream(
  model: Model<Api>,
  context: Context,
  options: SimpleStreamOptions | undefined,
  observe: (payload: unknown) => void,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  void (async () => {
    try {
      let payload: unknown = {
        model: model.id,
        store: false,
        stream: true,
        instructions: context.systemPrompt,
        input: context.messages.map(item => ({
          type: 'message',
          role: item.role,
          content: [{ type: 'input_text', text: item.role === 'user' && typeof item.content === 'string' ? item.content : JSON.stringify(item.content) }],
        })),
        text: { verbosity: 'medium' },
        reasoning: { effort: options?.reasoning ?? 'medium' },
        include: ['reasoning.encrypted_content'],
      }
      payload = await options?.onPayload?.(payload, model) ?? payload
      observe(payload)
      const output = message('base response')
      stream.push({ type: 'done', reason: 'stop', message: output })
      stream.end(output)
    } catch (error) {
      const output = message(error instanceof Error ? error.message : String(error), 'error')
      stream.push({ type: 'error', reason: 'error', error: output })
      stream.end(output)
    }
  })()
  return stream
}

function token(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({
    'https://api.openai.com/auth': { chatgpt_account_id: 'account-1' },
  })).toString('base64url')
  return `${header}.${body}.signature`
}

afterEach(() => vi.unstubAllGlobals())

describe('OpenAI remote compaction', () => {
  it('uses the unary compact endpoint and restores its opaque output on the next request', async () => {
    const seen: unknown[] = []
    const model = selectedModel()
    const base: Provider = {
      id: 'openai-codex',
      name: 'OpenAI Codex',
      baseUrl: 'https://chatgpt.com/backend-api',
      auth: { apiKey: { name: 'Key', resolve: async () => undefined } },
      getModels: () => [model],
      stream: (selected, context, options) => fakeStream(selected, context, options as SimpleStreamOptions, value => seen.push(value)),
      streamSimple: (selected, context, options) => fakeStream(selected, context, options as SimpleStreamOptions, value => seen.push(value)),
    }
    const canonical = [
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'retained' }] },
      { type: 'compaction', encrypted_content: 'opaque-server-state' },
    ]
    let fetchedUrl: RequestInfo | URL | undefined
    let fetchedInit: RequestInit | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchedUrl = input
      fetchedInit = init
      return new Response(JSON.stringify({ output: canonical }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = openAiRemoteCompactionProvider(base)
    const compacted = await provider.streamSimple(model, {
      systemPrompt: 'system',
      messages: [
        { role: 'user', content: 'old conversation', timestamp: 1 },
        { role: 'user', content: COMPACTION_PROMPT, timestamp: 2 },
      ],
      tools: [],
    }, { apiKey: token(), sessionId: 'session-1', reasoning: 'high' }).result()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchedUrl).toBe('https://chatgpt.com/backend-api/codex/responses/compact')
    const compactBody = JSON.parse(String(fetchedInit?.body)) as Record<string, unknown>
    expect(compactBody).toMatchObject({ model: 'gpt-test', reasoning: { effort: 'high' } })
    expect(compactBody).not.toHaveProperty('stream')
    expect(compactBody).not.toHaveProperty('store')
    const marker = (compacted.content[0] as { text: string }).text
    expect(marker).toContain('DSH_OPENAI_REMOTE_COMPACTION_V1')

    await provider.streamSimple(model, {
      messages: [
        { role: 'user', content: `checkpoint before\n${marker}\ncheckpoint after`, timestamp: 3 },
        { role: 'user', content: 'new work', timestamp: 4 },
      ],
    }, { apiKey: token() }).result()

    const restored = seen.at(-1) as { input: unknown[] }
    expect(restored.input).toEqual([
      ...canonical,
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'new work' }] },
    ])
  })

  it('filters ordinary Responses-only fields from the compact request', () => {
    expect(compactRequestPayload({
      model: 'gpt-test', input: [], instructions: 'system', tools: [],
      reasoning: { effort: 'high' }, text: { verbosity: 'medium' },
      store: false, stream: true, include: ['reasoning.encrypted_content'],
    })).toEqual({
      model: 'gpt-test', input: [], instructions: 'system', tools: [],
      reasoning: { effort: 'high' }, text: { verbosity: 'medium' },
    })
  })

  it('falls back to DSH text summarization when the preview endpoint fails', async () => {
    const model = selectedModel()
    const base: Provider = {
      id: 'openai-codex',
      name: 'OpenAI Codex',
      auth: { apiKey: { name: 'Key', resolve: async () => undefined } },
      getModels: () => [model],
      stream: (selected, context, options) => fakeStream(selected, context, options as SimpleStreamOptions | undefined, () => undefined),
      streamSimple: (selected, context, options) => fakeStream(selected, context, options as SimpleStreamOptions | undefined, () => undefined),
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('preview unavailable', { status: 503 })))

    const output = await openAiRemoteCompactionProvider(base).streamSimple(model, {
      messages: [
        { role: 'user', content: 'old conversation', timestamp: 1 },
        { role: 'user', content: COMPACTION_PROMPT, timestamp: 2 },
      ],
    }, { apiKey: token() }).result()

    expect(output.stopReason).toBe('stop')
    expect(output.content).toEqual([{ type: 'text', text: 'base response' }])
  })
})
