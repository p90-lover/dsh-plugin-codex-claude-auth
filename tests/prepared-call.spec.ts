import { describe, expect, it } from 'vitest'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ReplayCompatibleAdapter } from '../src/replay-compat.ts'
import { AutoFailoverAdapter, FailoverPreferences } from '../src/failover.ts'

it('keeps the prepared adapter generation through both plugin wrappers', async () => {
  let generation = 'old'
  class Delegate extends LlmAdapter {
    override async prepareCall(provider: string, model: string): Promise<PreparedAdapterCall> {
      const frozen = generation
      return { model: { provider, id: model, name: model }, stream: async function* () {
        yield { type: 'text-delta', index: 0, text: frozen }; yield { type: 'finish', reason: { kind: 'stop' } }
      } }
    }
    override async *stream(): AsyncIterable<StreamChunk> { yield { type: 'text-delta', index: 0, text: generation } }
  }
  const delegate = new ReplayCompatibleAdapter(new Delegate(), 'test', 'openai-codex')
  const adapter = new AutoFailoverAdapter({ listProviders: () => [{ id: 'test', name: 'Test' }], listModels: async () => [], stream: async function* () {} }, new FailoverPreferences({
    resolve: async () => undefined, describe: async () => ({ configured: false, writable: true }), set: async () => {}, unset: async () => {},
  }))
  adapter.configureRoute('test', { delegate, displayName: 'Test', rotate: async () => undefined, selectModel: async () => undefined })
  adapter.setAvailable('test', true)
  const prepared = await adapter.prepareCall('test', 'model')
  generation = 'new'
  const chunks: StreamChunk[] = []
  for await (const chunk of prepared.stream({ provider: 'test', model: 'model', messages: [] })) chunks.push(chunk)
  expect(chunks.find(c => c.type === 'text-delta')).toMatchObject({ text: 'old' })
})
