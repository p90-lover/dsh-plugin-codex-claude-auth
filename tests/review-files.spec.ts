import { mkdtemp, writeFile, symlink, mkdir, rename } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { it, expect } from 'vitest'
import { workingTreeFingerprint } from '../src/code-review.ts'

it('does not read an untracked symlink outside the repository', async () => {
  await mkdir(resolve('aiTemp'), { recursive: true })
  const dir = await mkdtemp(join(resolve('aiTemp'), 'review-safe-'))
  try {
    const repo = join(dir, 'repo')
    execFileSync('git', ['init', repo], { stdio: 'ignore' })
    execFileSync('git', ['-C', repo, '-c', 'user.email=test@example.invalid', '-c', 'user.name=Test', 'commit', '--allow-empty', '-m', 'initial'], { stdio: 'ignore' })
    const outside = join(dir, 'outside')
    await mkdir(outside)
    const secret = join(outside, 'secret')
    await writeFile(secret, 'before')
    await symlink(process.platform === 'win32' ? outside : secret, join(repo, 'link'), process.platform === 'win32' ? 'junction' : 'file')
    const before = await workingTreeFingerprint(repo, new AbortController().signal)
    await writeFile(secret, 'after-secret-changed')
    const after = await workingTreeFingerprint(repo, new AbortController().signal)
    expect(before).toBeTruthy()
    expect(after).toBe(before)
  } finally {
    await mkdir(resolve('Trash'), { recursive: true })
    await rename(dir, join(resolve('Trash'), basename(dir)))
  }
})
