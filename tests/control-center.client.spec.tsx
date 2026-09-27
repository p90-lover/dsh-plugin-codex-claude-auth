// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ControlCenter } from '../src/client/control-center.tsx'
import { ProviderService } from '../src/client/api.ts'
afterEach(() => { cleanup() })
const response = {
  connected: true, accounts: [{ id: 'one', label: 'Test account', active: true, useResetCredit: false, usage: { source: 'unavailable' } }],
  proxy: { configured: false, providerConfigured: false, sharedConfigured: false, entries: [] },
  failover: { providers: [] },
  contextWindow: { selected: 252000, options: [252000, 353000, 500000, 1000000], minimum: 252000, maximum: 1000000, modelLimits: { 'test-model': 400000 } },
}
function start(fetcher: typeof fetch = async () => Response.json(response)) {
  const service = new ProviderService(fetcher)
  render(<ControlCenter service={service} />)
  return service
}
it('renders unknown quota honestly rather than claiming 100 percent', async () => {
  start()
  expect((await screen.findAllByText('Test account')).length).toBe(2)
  expect(screen.queryByText('100%')).toBeNull()
  expect(screen.getAllByText('暫無資料').length).toBeGreaterThan(0)
})
it('saves the selected context and shows success only after acknowledgement', async () => {
  const calls: object[] = []
  start(async (_url, init) => {
    if (init?.method === 'POST') { calls.push(JSON.parse(String(init.body))); return Response.json({ ...response, contextWindow: { ...response.contextWindow, selected: 500000 } }) }
    return Response.json(response)
  })
  await screen.findAllByText('Test account')
  fireEvent.click(screen.getByRole('tab', { name: '上下文' }))
  fireEvent.click(screen.getByRole('button', { name: '500K' }))
  fireEvent.click(screen.getByRole('button', { name: '套用上下文' }))
  await screen.findByText('設定已由宿主確認。下一個請求會使用新的有效上限。')
  expect(calls).toContainEqual({ value: 500000 })
})
it('shows a rejected save and does not show a false success message', async () => {
  start(async (_url, init) => init?.method === 'POST'
    ? Response.json({ error: 'Host refused this change' }, { status: 400 }) : Response.json(response))
  await screen.findAllByText('Test account')
  fireEvent.click(screen.getByRole('tab', { name: '上下文' }))
  fireEvent.click(screen.getByRole('button', { name: '1M' }))
  fireEvent.click(screen.getByRole('button', { name: '套用上下文' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('Host refused')
  expect(screen.queryByText('設定已由宿主確認。下一個請求會使用新的有效上限。')).toBeNull()
})
it('offers keyboard-operable tabs and explains unavailable failover destinations', async () => {
  start()
  const tab = screen.getByRole('tab', { name: '帳號與額度' })
  fireEvent.keyDown(tab, { key: 'ArrowRight' })
  await waitFor(() => expect(screen.getByRole('tab', { name: '上下文' }).getAttribute('aria-selected')).toBe('true'))
})
it('does not offer context writes until the provider is signed in', async () => {
  const post = vi.fn()
  start(async (_url, init) => {
    if (init?.method === 'POST') post()
    return Response.json({ ...response, connected: false, accounts: [] })
  })
  await screen.findAllByText('尚未登入')
  fireEvent.click(screen.getByRole('tab', { name: '上下文' }))
  await screen.findByText('請先在「帳號與額度」登入 OpenAI，再調整上下文預算。')
  expect(screen.queryByRole('button', { name: '套用上下文' })).toBeNull()
  expect(post).not.toHaveBeenCalled()
})

it('preserves a handoff draft across internal tabs without exposing hidden controls', async () => {
  const service = start()
  await screen.findAllByText('Test account')
  fireEvent.click(screen.getByRole('tab', { name: '工作交接' }))
  const fields = [
    ['任務目標', 'Finish the provider upgrade'],
    ['已完成的工作與重要決定', 'Compatibility checks passed; release is pending.'],
    ['下一步（每行一項）', 'Verify the release package'],
    ['專案相對路徑（每行一項）', 'src/client/index.tsx'],
  ] as const
  for (const [name, value] of fields) fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })
  fireEvent.click(screen.getByRole('tab', { name: '帳號與額度' }))
  expect(screen.queryByRole('textbox', { name: '任務目標' })).toBeNull()
  expect(screen.queryByRole('button', { name: '匯出可讀摘要' })).toBeNull()
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  fireEvent.click(screen.getByRole('tab', { name: '工作交接' }))
  for (const [name, value] of fields) expect((screen.getByRole('textbox', { name }) as HTMLInputElement).value).toBe(value)
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  service.dispose()
})

const staleFallbackResponse = {
  ...response,
  accounts: response.accounts.map(account => ({ ...account, failoverModel: 'retired-model' })),
  failover: { providers: [{
    id: 'openai-codex-oauth', name: 'OpenAI Codex', available: true, enabled: true,
    model: 'retired-model', defaultModel: 'current-model',
    models: [{ id: 'current-model', name: 'Current model', efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' }],
  }] },
}
it.each([
  { scope: 'account', tab: '帳號與額度', model: '備援模型', effort: '備援推理強度' },
  { scope: 'provider', tab: '自動備援', model: '目的模型', effort: '推理強度' },
])('keeps $scope effort controls usable after a saved model leaves the catalog', async ({ tab, model, effort }) => {
  const service = start(async () => Response.json(staleFallbackResponse))
  await screen.findAllByText('Test account')
  fireEvent.click(screen.getByRole('tab', { name: tab }))
  const modelSelect = screen.getByLabelText(model) as HTMLSelectElement
  const effortSelect = screen.getByLabelText(effort) as HTMLSelectElement
  expect(modelSelect.value).toBe('')
  expect(effortSelect.disabled).toBe(false)
  expect([...effortSelect.options].map(option => option.value)).toContain('high')
  service.dispose()
})
