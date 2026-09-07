import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
// Drift canary, not a claim that unbuilt upstream master passed runtime tests.
const base = 'https://api.github.com/repos/deepseek-ai/deepseek-harness'
const headers = { accept: 'application/vnd.github+json', 'user-agent': 'dsh-oauth-compatibility-canary' }
if (process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`
async function read(path) {
  const response = await fetch(base + path, { headers, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Upstream metadata HTTP ${response.status}`)
  return response.json()
}
const [branch, releases] = await Promise.all([read('/branches/master'), read('/releases?per_page=1')])
const contracts = ['packages/client/ui-model-selection/src/client/directory.ts', 'packages/client/ui-session/src/client/index.ts', 'packages/llm/llm-pi-ai/src/adapter.ts', 'packages/settings/settings/src/index.ts']
const descriptors = await Promise.all(contracts.map(async path => {
  const file = await read(`/contents/${path}?ref=${branch.commit.sha}`)
  return { path, sha: file.sha }
}))
const report = { checkedAt: new Date().toISOString(), master: branch.commit.sha, latestRelease: releases[0]?.tag_name, contracts: descriptors, scope: 'metadata/contract drift only; runtime verification uses pinned published packages' }
mkdirSync('artifacts', { recursive: true })
writeFileSync('artifacts/upstream-canary.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (!['dsh-v0.1.2-rc.1', 'dsh-v0.1.3-alpha.2'].includes(report.latestRelease)) throw new Error('New unverified upstream release: compatibility review required before upgrading.')
