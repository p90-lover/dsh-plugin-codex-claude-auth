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
