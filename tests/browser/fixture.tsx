import { createRoot } from 'react-dom/client'
import { ControlCenter } from '../../src/client/control-center.tsx'
import { ComposerStatus } from '../../src/client/composer.tsx'
import { ProviderService } from '../../src/client/api.ts'
import type { ModelDirectory } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { PublicProviderStatus } from '../../src/shared/contracts.ts'
const routes = ['openai-codex-oauth', 'anthropic-oauth']
const models = ['sample-gpt', 'sample-claude']
const providers: PublicProviderStatus['failover']['providers'][number][] = routes.map((id, i) => ({ id, name: i === 0 ? 'OpenAI Codex' : 'Anthropic Claude', enabled: false, available: true, defaultModel: models[i]!, models: [{ id: models[i]!, name: models[i]!, efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'low' }] }))
const states: PublicProviderStatus[] = routes.map((_, i) => ({ connected: true, accounts: [{ id: 'sample-account', label: 'Example workspace · test data', active: true, useResetCredit: false, usage: { source: i === 0 ? 'openai-live' : 'claude-live', usedPercent: 18, remainingPercent: 82, resetsAt: 2000000000, windows: [{ id: 'five-hour', usedPercent: 18, remainingPercent: 82, windowMinutes: 300 }, { id: 'weekly', usedPercent: 35, remainingPercent: 65, windowMinutes: 10080 }] } }], proxy: { configured: false, providerConfigured: false, sharedConfigured: false, entries: [] }, failover: { providers }, ...(i === 0 ? { contextWindow: { selected: 252000, options: [252000, 353000, 500000, 1000000], minimum: 252000, maximum: 1000000, modelLimits: { 'sample-gpt': 1000000 } } } : {}) }))
const mutations: Array<{ action: string; body: Record<string, unknown> }> = []
const service = new ProviderService(async (url, init) => {
  const index = String(url).includes('anthropic-oauth') ? 1 : 0
  const state = states[index]!
  const action = String(url).split(routes[index]!)[1]!
  if (init?.method === 'POST') {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    mutations.push({ action, body })
    if (body.value === 999000) return Response.json({ error: 'Simulated host refusal' }, { status: 400 })
    if (action === '/context-window') state.contextWindow!.selected = Number(body.value)
    if (action === '/failover/effort') providers.find(p => p.id === body.providerId)!.effort = String(body.effortId)
    if (action === '/failover/enabled') providers.find(p => p.id === body.providerId)!.enabled = Boolean(body.enabled)
    if (action === '/proxy/entries/add') for (const item of states) item.proxy.entries = [{ id: 'sample-proxy', label: String(body.label), display: 'http://proxy.invalid:8080', default: true }]
    if (action === '/proxy/entries/remove') for (const item of states) item.proxy.entries = []
    if (action === '/logout') { state.connected = false; state.accounts = [] }
  }
  return Response.json(state)
})
let current = { provider: routes[0]!, model: models[0]! }
let directoryState = { current }
const listeners = new Set<() => void>()
const directory = { store: { getSnapshot: () => directoryState, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } } }, load: async () => directoryState } as unknown as ModelDirectory
declare global { interface Window { fixture: { mutations: typeof mutations; selectClaude(): void } } }
window.fixture = { mutations, selectClaude: () => { current = { provider: routes[1]!, model: models[1]! }; directoryState = { current }; for (const listener of listeners) listener() } }
createRoot(document.getElementById('root')!).render(<><p style={{ fontSize: 12, color: '#667085', margin: '0 0 18px' }}>Isolated UI fixture · 虛構測試資料，並非真實帳號</p><ControlCenter service={service} /><div style={{ marginTop: 20, padding: 15, border: '1px solid #e2e7ef', borderRadius: 12 }}><ComposerStatus service={service} directory={directory} available /></div></>)
