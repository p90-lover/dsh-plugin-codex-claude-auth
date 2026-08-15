import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  Provider,
} from '@earendil-works/pi-ai'
import type { Message } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { repairLegacyReplayMessages } from '../src/replay-compat.ts'
import { enforceReasoningPayload, routedProvider } from '../src/routed-provider.ts'

function model(provider: string): Model<Api> {
  return {
    id: 'model-1',
    name: 'Model 1',
    api: 'openai-responses',
    provider,
    baseUrl: 'https://example.test',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1024,
    maxTokens: 128,
  }
}

function assistant(provider: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'ok' }],
    api: 'openai-responses',
    provider,
    model: 'model-1',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: 1,
  }
}

describe('routedProvider', () => {
  it('enforces the selected effort in OpenAI and adaptive Claude wire payloads', () => {
    const openai = { ...model('openai-codex'), reasoning: true, thinkingLevelMap: { high: 'high' } }
    expect(enforceReasoningPayload({ model: 'gpt-test' }, openai, 'high')).toMatchObject({
      reasoning: { effort: 'high', summary: 'auto' },
    })

    const claude = {
      ...model('anthropic'),
      reasoning: true,
      thinkingLevelMap: { xhigh: 'xhigh' },
      compat: { forceAdaptiveThinking: true },
    }
    expect(enforceReasoningPayload({ model: 'claude-test' }, claude, 'xhigh')).toMatchObject({
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'xhigh' },
    })
  })
  it('publishes the Harness route but restores the upstream provider id for dispatch', async () => {
    let dispatchedProvider: string | undefined
    const baseModel = model('upstream')
    const stream = (): AssistantMessageEventStream => {
      const value = createAssistantMessageEventStream()
      queueMicrotask(() => value.push({ type: 'done', reason: 'stop', message: assistant('upstream') }))
      return value
    }
    const base: Provider = {
      id: 'upstream',
      name: 'Upstream',
      auth: {
        oauth: {
          name: 'OAuth',
          login: async () => ({ type: 'oauth', access: 'a', refresh: 'r', expires: 1 }),
          refresh: async credential => credential,
          toAuth: async credential => ({ apiKey: credential.access }),
        },
      },
      getModels: () => [baseModel],
      stream: (selected) => {
        dispatchedProvider = selected.provider
        return stream()
      },
      streamSimple: (selected) => {
        dispatchedProvider = selected.provider
        return stream()
      },
    }
    const routed = routedProvider(base, 'oauth-route', 'OAuth Route')
    const selected = routed.getModels()[0]

    expect(routed.id).toBe('oauth-route')
    expect(selected?.provider).toBe('oauth-route')
    expect(routed.auth.apiKey).toBeDefined()

    routed.streamSimple(selected!, { systemPrompt: '', messages: [], tools: [] } as Context)
    expect(dispatchedProvider).toBe('upstream')
  })

  it('normalizes every streamed assistant identity to the Harness route', async () => {
    const upstream = createAssistantMessageEventStream()
    const base: Provider = {
      id: 'upstream',
      name: 'Upstream',
      auth: { apiKey: { name: 'Key', resolve: async () => undefined } },
      getModels: () => [model('upstream')],
      stream: () => upstream,
      streamSimple: () => upstream,
    }
    const routed = routedProvider(base, 'oauth-route', 'OAuth Route')
    const output = routed.streamSimple(
      routed.getModels()[0]!,
      { systemPrompt: '', messages: [], tools: [] } as Context,
    )
    upstream.push({ type: 'start', partial: assistant('upstream') })
    upstream.push({ type: 'done', reason: 'stop', message: assistant('upstream') })

    const providers: string[] = []
    for await (const event of output) {
      providers.push(event.type === 'done'
        ? event.message.provider
        : event.type === 'error' ? event.error.provider : event.partial.provider)
    }
    expect(providers).toEqual(['oauth-route', 'oauth-route'])
    await expect(output.result()).resolves.toMatchObject({ provider: 'oauth-route' })
  })

  it('preserves DSH tool definitions, streamed calls, and call ids through the OAuth route', async () => {
    let dispatchedContext: Context | undefined
    const toolMessage: AssistantMessage = {
      ...assistant('upstream'),
      content: [{
        type: 'toolCall',
        id: 'call_read_1|fc_read_1',
        name: 'read_file',
        arguments: { path: 'README.md' },
      }],
      stopReason: 'toolUse',
    }
    const base: Provider = {
      id: 'upstream',
      name: 'Upstream',
      auth: { apiKey: { name: 'Key', resolve: async () => undefined } },
      getModels: () => [model('upstream')],
      stream: () => { throw new Error('not used') },
      streamSimple: (_selected, context) => {
        dispatchedContext = context
        const stream = createAssistantMessageEventStream()
        queueMicrotask(() => stream.push({ type: 'done', reason: 'toolUse', message: toolMessage }))
        return stream
      },
    }
    const routed = routedProvider(base, 'openai-codex-oauth', 'OpenAI Codex (OAuth)')
    const context = {
      systemPrompt: 'Use tools when needed.',
      messages: [],
      tools: [{
        name: 'read_file',
        description: 'Read one workspace file.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      }],
    } as Context

    const output = routed.streamSimple(routed.getModels()[0]!, context)
    const result = await output.result()
    expect(dispatchedContext?.tools).toBe(context.tools)
    expect(result).toMatchObject({
      provider: 'openai-codex-oauth',
      stopReason: 'toolUse',
      content: [{
        type: 'toolCall',
        id: 'call_read_1|fc_read_1',
        name: 'read_file',
        arguments: { path: 'README.md' },
      }],
    })
  })

  it('repairs only the legacy upstream replay alias on saved route messages', () => {
    const original = [{
      id: 'message-1',
      role: 'assistant',
      content: [{ type: 'text', text: 'saved' }],
      source: {
        kind: 'model',
        provider: 'oauth-route',
        model: 'model-1',
        replayState: {
          kind: 'pi-ai',
          version: 1,
          api: 'openai-responses',
          provider: 'upstream',
          model: 'model-1',
          stopReason: 'stop',
          blocks: [{ type: 'text' }],
        },
      },
    }] as unknown as Message[]

    const repaired = repairLegacyReplayMessages(original, 'oauth-route', 'upstream')
    expect(repaired).not.toBe(original)
    expect((repaired[0]?.source as { replayState?: { provider?: string } }).replayState?.provider)
      .toBe('oauth-route')
    expect((original[0]?.source as { replayState?: { provider?: string } }).replayState?.provider)
      .toBe('upstream')
  })
})
