import { describe, expect, it, vi } from 'vitest'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { AutoFailoverAdapter, FailoverPreferences } from '../src/failover.ts'
import type { HarnessCredentialBackend } from '../src/credential-store.ts'

function setup(attempts: StreamChunk[][]) {
  const values = new Map<string, string>()
  const backend: HarnessCredentialBackend = {
    resolve: async k => values.has(k) ? { value: values.get(k)!, source: 'test' } : undefined,
    describe: async k => ({ configured: values.has(k), writable: true }),
    set: async (k, v) => { values.set(k, v) }, unset: async k => { values.delete(k) },
  }
  const prefs = new FailoverPreferences(backend)
  const seen: GenerateOptions[] = []
  const target = vi.fn()
  class Source extends LlmAdapter {
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      seen.push(options)
      yield* attempts.shift() ?? [{ type: 'finish', reason: { kind: 'stop' } }]
    }
  }
  const adapter = new AutoFailoverAdapter({
    listProviders: () => [{ id: 'source', name: 'Source' }, { id: 'target', name: 'Target' }],
    listModels: async provider => [{ provider, id: 'model', name: 'Model' }],
    stream: async function* (options) { target(options); yield { type: 'finish', reason: { kind: 'stop' } } },
  }, prefs)
  adapter.configureRoute('source', {
    delegate: new Source(), displayName: 'Source', rotate: async () => undefined, selectModel: async () => 'model',
  })
  adapter.setAvailable('source', true)
  const run = async (model = 'model') => {
    const result: StreamChunk[] = []
    for await (const chunk of adapter.stream({ provider: 'source', model, sessionId: 'test' as never, messages: [] })) result.push(chunk)
    return result
  }
  return { prefs, adapter, target, seen, run }
}
const failed: StreamChunk = { type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT', message: 'quota', status: 429 } } }

describe('failover consent and stream safety', () => {
  it('does not send a conversation to another provider without explicit opt-in', async () => {
    const s = setup([[failed]])
    expect(await s.prefs.effectiveOrder(['source', 'target'])).toEqual([])
    await s.run()
    expect(s.target).not.toHaveBeenCalled()
  })
  it('reordering destinations does not grant consent', async () => {
    const s = setup([])
    await s.prefs.setProviderOrder(['target', 'source'])
    expect(await s.prefs.effectiveOrder(['target', 'source'])).toEqual([])
  })
  it('an explicit model selection supersedes the sticky fallback immediately', async () => {
    const s = setup([[failed]])
    await s.prefs.setProviderEnabled('target', true, ['source', 'target'])
    await s.run()
    await s.run('new-explicit-model')
    expect(s.seen.at(-1)?.model).toBe('new-explicit-model')
    expect(s.target).toHaveBeenCalledTimes(1)
  })
  it('disabling a fallback also invalidates a sticky session route', async () => {
    const s = setup([[failed]])
    await s.prefs.setProviderEnabled('target', true, ['source', 'target'])
    await s.run()
    await s.prefs.setProviderEnabled('target', false, ['source', 'target'])
    await s.run()
    expect(s.seen).toHaveLength(2)
    expect(s.target).toHaveBeenCalledTimes(1)
  })
  it('does not replay tools after a complete block without deltas', async () => {
    const s = setup([[
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'committed result' } }, failed,
    ]])
    await s.prefs.setProviderEnabled('target', true, ['source', 'target'])
    await s.run()
    expect(s.target).not.toHaveBeenCalled()
  })
  it('discards uncommitted block starts before reusing stream indices', async () => {
    const s = setup([[{ type: 'block-start', index: 0, blockType: 'text' }, failed]])
    await s.prefs.setProviderEnabled('target', true, ['source', 'target'])
    const result = await s.run()
    expect(result.filter(c => c.type === 'block-start' && c.index === 0)).toHaveLength(1)
  })
})
