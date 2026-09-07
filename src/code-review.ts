import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, realpath, open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

const execFileAsync = promisify(execFile)
const REVISION_PATTERN = /^[A-Za-z0-9._/@{}~^:+-]+$/u

export type ReviewScope =
  | { kind: 'uncommitted' }
  | { kind: 'auto' }
  | { kind: 'base', revision: string }
  | { kind: 'commit', revision: string }
  | { kind: 'custom', instructions: string }
  | { kind: 'help' }

export const REVIEW_USAGE = [
  'Code review usage:',
  '/review — staged, unstaged, and untracked changes',
  '/review auto — review only when the working tree changed since the last review',
  '/review base <branch> — changes from the merge base to HEAD',
  '/review commit <revision> — one exact commit',
  '/review custom <instructions> — uncommitted changes with extra review criteria',
].join('\n')

/** Parse the Codex-compatible review scopes exposed by DSH. */
export function parseReviewScope(rawInput: string): ReviewScope {
  const input = rawInput.trim()
  if (input.length === 0 || input === 'uncommitted') return { kind: 'uncommitted' }
  if (input === 'auto') return { kind: 'auto' }
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
    case 'auto':
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
  if (scope.kind === 'auto') return 'new uncommitted changes (automatic)'
  if (scope.kind === 'uncommitted') return 'uncommitted changes'
  if (scope.kind === 'custom') return 'uncommitted changes with custom criteria'
  return `${scope.kind} ${scope.revision}`
}

async function gitOutput(cwd: string, args: readonly string[], signal: AbortSignal): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    signal,
    timeout: 10_000,
  })
  return stdout
}

async function assertGitRepository(cwd: string, signal: AbortSignal): Promise<string> {
  try {
    return (await gitOutput(cwd, ['rev-parse', '--show-toplevel'], signal)).trim()
  } catch {
    throw new Error(`Code review requires a Git repository workspace. Current workspace: ${cwd}`)
  }
}

export async function workingTreeFingerprint(root: string, signal: AbortSignal): Promise<string | undefined> {
  const status = await gitOutput(root, ['status', '--porcelain=v1', '--untracked-files=all'], signal)
  if (status.trim().length === 0) return undefined

  const [diff, untrackedOutput] = await Promise.all([
    gitOutput(root, ['diff', '--binary', 'HEAD', '--'], signal),
    gitOutput(root, ['ls-files', '--others', '--exclude-standard', '-z'], signal),
  ])
  const hash = createHash('sha256').update(status).update('\0').update(diff)
  const untracked = untrackedOutput.split('\0').filter(Boolean).sort()
  const realRoot = await realpath(root)
  let budget = 8 * 1024 * 1024
  for (const name of untracked) {
    const path = resolve(root, name)
    const local = relative(root, path)
    if (local.startsWith('..') || isAbsolute(local)) continue
    hash.update('\0').update(name).update('\0')
    try {
      const stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink()) { hash.update('<non-regular>'); continue }
      const resolved = await realpath(path)
      const within = relative(realRoot, resolved)
      if (within.startsWith('..') || isAbsolute(within)) { hash.update('<outside>'); continue }
      if (stat.size > 1024 * 1024 || stat.size > budget) {
        hash.update(`large:${stat.size}:${stat.mtimeMs}`)
        continue
      }
      const handle = await open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        const opened = await handle.stat()
        if (!opened.isFile() || opened.ino !== stat.ino || opened.size !== stat.size) {
          hash.update('<changed-during-read>'); continue
        }
        const buffer = Buffer.alloc(opened.size)
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
        hash.update(buffer.subarray(0, bytesRead))
        budget -= bytesRead
      } finally { await handle.close() }
    } catch {
      hash.update('<unreadable>')
    }
  }
  return hash.digest('hex')
}

/** Register the read-only Codex-style /review workflow once. */
export function installCodeReview(ctx: Context): void {
  const reviewedFingerprints = new Map<string, string>()
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
        let root: string
        try {
          root = await assertGitRepository(cwd, signal)
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }

        if (scope.kind === 'auto' || scope.kind === 'uncommitted') {
          let fingerprint: string | undefined
          try {
            fingerprint = await workingTreeFingerprint(root, signal)
          } catch (error) {
            return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
          }
          const sessionId = String(agent.id)
          if (scope.kind === 'auto') {
            if (fingerprint === undefined) {
              return { kind: 'success', text: 'Automatic code review skipped: the working tree has no changes.' }
            }
            if (reviewedFingerprints.get(sessionId) === fingerprint) {
              return { kind: 'success', text: 'Automatic code review skipped: these changes were already reviewed.' }
            }
          }
          if (fingerprint !== undefined) reviewedFingerprints.set(sessionId, fingerprint)
        }

        agent.followup(createUserMessage({
          content: [{ type: 'text', text: buildReviewPrompt(scope, root) }],
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
