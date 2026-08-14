import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { describe, expect, it } from 'vitest'
import type { HarnessCredentialBackend } from '../src/credential-store.ts'
import { HarnessOAuthCredentialStore } from '../src/credential-store.ts'

function ref(value: string): CredentialRef {
  return value as CredentialRef
}

function memoryBackend(): HarnessCredentialBackend & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    resolve: async credentialRef => values.has(credentialRef)
      ? { value: values.get(credentialRef)!, source: 'test' }
      : undefined,
    describe: async credentialRef => ({ configured: values.has(credentialRef), writable: true }),
    set: async (credentialRef, value) => { values.set(credentialRef, value) },
    unset: async credentialRef => { values.delete(credentialRef) },
  }
}

describe('HarnessOAuthCredentialStore', () => {
  it('persists, reads, lists, and removes one OAuth credential without exposing it in metadata', async () => {
    const backend = memoryBackend()
    const store = new HarnessOAuthCredentialStore(backend, new Map([['openai-codex', ref('TEST_OAUTH')]]))
    const credential = {
      type: 'oauth' as const,
      access: 'access-secret',
      refresh: 'refresh-secret',
      expires: Date.now() + 60_000,
    }

    await store.modify('openai-codex', async () => credential)

    expect(await store.read('openai-codex')).toEqual(credential)
    expect(await store.list()).toEqual([{ providerId: 'openai-codex', type: 'oauth' }])
    expect(JSON.stringify(await store.list())).not.toContain('secret')

    await store.delete('openai-codex')
    expect(await store.read('openai-codex')).toBeUndefined()
  })

  it('serializes concurrent refresh mutations in one process', async () => {
    const backend = memoryBackend()
    const store = new HarnessOAuthCredentialStore(backend, new Map([['anthropic', ref('TEST_CLAUDE_OAUTH')]]))
    await store.modify('anthropic', async () => ({
      type: 'oauth', access: 'a0', refresh: 'r0', expires: 0, generation: 0,
    }))

    await Promise.all([1, 2].map(() => store.modify('anthropic', async current => {
      const generation = current?.type === 'oauth' && typeof current.generation === 'number'
        ? current.generation
        : 0
      await Promise.resolve()
      return {
        type: 'oauth',
        access: `a${generation + 1}`,
        refresh: `r${generation + 1}`,
        expires: generation + 1,
        generation: generation + 1,
      }
    })))

    const stored = await store.read('anthropic')
    expect(stored?.type === 'oauth' ? stored.generation : undefined).toBe(2)
  })
})
