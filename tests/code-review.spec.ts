import { describe, expect, it } from 'vitest'
import { buildReviewPrompt, parseReviewScope } from '../src/code-review.ts'

describe('Codex-style code review', () => {
  it('parses supported scopes and keeps the generated workflow read-only', () => {
    expect(parseReviewScope('')).toEqual({ kind: 'uncommitted' })
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
