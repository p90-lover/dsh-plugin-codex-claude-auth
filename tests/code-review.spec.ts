import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { Message } from '@deepseek-ai/dsh-llm'
import { buildReviewPrompt, installCodeReview, parseReviewScope } from '../src/code-review.ts'

describe('Codex-style code review', () => {
  it('parses supported scopes and keeps the generated workflow read-only', () => {
    expect(parseReviewScope('')).toEqual({ kind: 'uncommitted' })
    expect(parseReviewScope('auto')).toEqual({ kind: 'auto' })
    expect(parseReviewScope('base main')).toEqual({ kind: 'base', revision: 'main' })
    expect(parseReviewScope('commit HEAD~1')).toEqual({ kind: 'commit', revision: 'HEAD~1' })
    expect(parseReviewScope('security and data loss only')).toEqual({
      kind: 'custom',
      instructions: 'security and data loss only',
    })

    const prompt = buildReviewPrompt({ kind: 'base', revision: 'main' }, 'C:\\repo')
    expect(prompt).toContain('dedicated read-only code review')
    expect(prompt).toContain('Do not edit, create, move, or delete files')
    expect(prompt).toContain('merge-base...HEAD diff')
    expect(prompt).toContain('P0, P1, P2, or P3')
    expect(prompt).toContain('No actionable findings.')
  })
})

it('queues a durable review message with its own producer identity', async () => {
  let command: CommandDefinition | undefined
  let queued: Message | undefined
  const ctx = {
    inject: (_names: string[], callback: (scope: Context) => void) => callback({
      commands: { register: (definition: CommandDefinition) => { command = definition } },
    } as unknown as Context),
  } as unknown as Context
  installCodeReview(ctx)
  const result = await command!.handler({
    rawInput: 'custom Check request compatibility',
    signal: new AbortController().signal,
    agent: {
      session: { header: { cwd: process.cwd() } },
      followup: (message: Message) => { queued = message },
    },
  } as never)
  expect(result.kind).toBe('success')
  expect(queued).toMatchObject({
    role: 'user',
    source: { kind: 'dsh-oauth-code-review', form: 'notice' },
    content: [{ type: 'text', text: expect.stringContaining('dedicated read-only code review') }],
  })
  expect(queued?.id).toBeTruthy()
  expect(Object.isFrozen(queued)).toBe(true)
})
