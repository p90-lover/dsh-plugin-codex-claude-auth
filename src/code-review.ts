import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

const execFileAsync = promisify(execFile)
const REVISION_PATTERN = /^[A-Za-z0-9._/@{}~^:+-]+$/u

export type ReviewScope =
  | { kind: 'uncommitted' }
  | { kind: 'base', revision: string }
  | { kind: 'commit', revision: string }
  | { kind: 'custom', instructions: string }
  | { kind: 'help' }

export const REVIEW_USAGE = [
  'Code review usage:',
  '/review — staged, unstaged, and untracked changes',
  '/review base <branch> — changes from the merge base to HEAD',
  '/review commit <revision> — one exact commit',
  '/review custom <instructions> — uncommitted changes with extra review criteria',
].join('\n')

/** Parse the Codex-compatible review scopes exposed by DSH. */
export function parseReviewScope(rawInput: string): ReviewScope {
  const input = rawInput.trim()
  if (input.length === 0 || input === 'uncommitted') return { kind: 'uncommitted' }
  if (input === 'help') return { kind: 'help' }

  const [kind, ...parts] = input.split(/\s+/u)
  const value = parts.join(' ').trim()
  if (kind === 'base' || kind === 'commit') {
    if (value.length === 0 || !REVISION_PATTERN.test(value)) {
      throw new Error(`${kind} requires one valid Git revision without spaces.\n\n${REVIEW_USAGE}`)
    }
    return { kind, revision: value }
  }
  if (kind === 'custom') {
    if (value.length === 0) throw new Error(`custom requires review instructions.\n\n${REVIEW_USAGE}`)
    return { kind: 'custom', instructions: value }
  }
  return { kind: 'custom', instructions: input }
}

function scopeInstructions(scope: Exclude<ReviewScope, { kind: 'help' }>): string {
  switch (scope.kind) {
    case 'uncommitted':
      return [
        'Review all local work that is not in HEAD.',
        'Inspect staged changes, unstaged changes, and untracked files. Use git status and the appropriate git diff commands.',
      ].join('\n')
    case 'base':
      return [
        `Review the changes on the current branch relative to base revision ${scope.revision}.`,
        `Resolve the merge base with ${scope.revision}, then inspect the merge-base...HEAD diff.`,
      ].join('\n')
    case 'commit':
      return `Review only the exact change introduced by commit ${scope.revision}, including enough surrounding code to validate each finding.`
    case 'custom':
      return [
        'Review all staged, unstaged, and untracked changes.',
        '<additional_review_instructions>',
        scope.instructions,
        '</additional_review_instructions>',
      ].join('\n')
  }
}

/** Build the model-visible, read-only Codex review contract. */
export function buildReviewPrompt(scope: Exclude<ReviewScope, { kind: 'help' }>, cwd: string): string {
  return [
    'Perform a dedicated read-only code review. Do not edit, create, move, or delete files, and do not change Git state.',
    '',
    `Repository working directory: ${cwd}`,
    scopeInstructions(scope),
    '',
    'Review contract:',
    '- Use read-only Git and file inspection to establish the exact change set and inspect relevant surrounding code and tests.',
    '- Report only actionable bugs, regressions, security problems, data-loss risks, or clear correctness failures introduced by the reviewed change.',
    '- Do not report style preferences, broad refactors, speculative concerns, or pre-existing issues unrelated to the reviewed change.',
    '- Before reporting a finding, verify that it is reachable and not already handled elsewhere in the code.',
    '- Prioritize every finding as P0, P1, P2, or P3. Include the exact file and tight line location, impact, evidence, and concise fix direction.',
    '- Order findings by severity. If there are no actionable findings, answer exactly: No actionable findings.',
    '- Keep the review self-contained and do not modify the working tree.',
  ].join('\n')
}

function scopeLabel(scope: Exclude<ReviewScope, { kind: 'help' }>): string {
  if (scope.kind === 'uncommitted') return 'uncommitted changes'
  if (scope.kind === 'custom') return 'uncommitted changes with custom criteria'
  return `${scope.kind} ${scope.revision}`
}

async function assertGitRepository(cwd: string, signal: AbortSignal): Promise<void> {
  try {
    await execFileAsync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      windowsHide: true,
      signal,
      timeout: 10_000,
    })
  } catch {
    throw new Error(`Code review requires a Git repository workspace. Current workspace: ${cwd}`)
  }
}

/** Register the read-only Codex-style /review workflow once. */
export function installCodeReview(ctx: Context): void {
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'review',
      description: 'Run a dedicated read-only code review.',
      input: { hint: '[base <branch> | commit <revision> | custom <instructions>]' },
      handler: async ({ agent, rawInput, signal }) => {
        let scope: ReviewScope
        try {
          scope = parseReviewScope(rawInput)
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
        if (scope.kind === 'help') return { kind: 'success', text: REVIEW_USAGE }

        const cwd = agent.session.header.cwd
        if (cwd === undefined) {
          return { kind: 'error', text: 'Code review requires a session with a workspace directory.' }
        }
        try {
          await assertGitRepository(cwd, signal)
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }

        agent.followup(createUserMessage({
          content: [{ type: 'text', text: buildReviewPrompt(scope, cwd) }],
          source: {
            kind: 'plugin',
            plugin: 'dsh-oauth-model-providers',
            form: 'notice',
            summary: `Read-only code review requested: ${scopeLabel(scope)}`,
          },
        }))
        return {
          kind: 'success',
          text: `Code review started for ${scopeLabel(scope)}. Findings will remain in this chat.`,
        }
      },
    })
  })
}
