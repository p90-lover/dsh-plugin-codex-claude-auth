import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { it, expect } from 'vitest'
import { workingTreeFingerprint } from '../src/code-review.ts'

it('does not read an untracked symlink outside the repository', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-safe-'))
  try {
    const repo = join(dir, 'repo')
    execFileSync('git', ['init', repo], { stdio: 'ignore' })
    execFileSync('git', ['-C', repo, '-c', 'user.email=test@example.invalid', '-c', 'user.name=Test', 'commit', '--allow-empty', '-m', 'initial'], { stdio: 'ignore' })
    const secret = join(dir, 'outside-secret')
    await writeFile(secret, 'before')
    await symlink(secret, join(repo, 'link'))
    const before = await workingTreeFingerprint(repo, new AbortController().signal)
    await writeFile(secret, 'after-secret-changed')
    const after = await workingTreeFingerprint(repo, new AbortController().signal)
    expect(after).toBe(before)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
