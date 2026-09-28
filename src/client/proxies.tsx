import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ProviderService } from './api.ts'
import { PROVIDERS } from './contracts.ts'
import type { ProviderId, ProviderStatus } from './contracts.ts'
import { Button, Notice, useAction, useLanguage, useProvider } from './ui.tsx'

function Assignment({ service, id }: { service: ProviderService; id: ProviderId }): ReactNode {
  const { text } = useLanguage()
  const state = useProvider(service, id)
  const action = useAction()
  const info = state.data?.proxy
  const provider = PROVIDERS.find(p => p.id === id)!
  return <div className="o-list-row"><div className="o-grow"><strong>{provider.name}</strong><div className="o-small">{info?.display ?? text('繼承 Harness 的出站網路設定', 'Inherit Harness outbound networking')}</div></div><label className="o-field"><span>{text('提供者預設路由', 'Provider default route')}</span><select aria-label={`${provider.name} ${text('代理路由', 'proxy route')}`} disabled={!info || action.pending || state.busy} value={info?.providerProxyId ?? ''} onChange={event => {
    void action.run(() => service.mutate(id, '/proxy/provider', { proxyId: event.target.value || null }), text('代理指派已儲存。', 'Proxy assignment saved.'))
  }}><option value="">{text('繼承共用預設', 'Inherit shared default')}</option>{info?.entries.map(proxy => <option key={proxy.id} value={proxy.id}>{proxy.label}</option>)}</select></label><Notice notice={action.notice} /></div>
}

export function ProxyPanel({ service }: { service: ProviderService }): ReactNode {
  const { text } = useLanguage()
  const first = useProvider(service, 'codex')
  const second = useProvider(service, 'claude')
  const target: ProviderId = first.data && !first.error ? 'codex' : 'claude'
  const snapshot = target === 'codex' ? first : second
  const proxies = snapshot.data?.proxy.entries ?? []
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [remove, setRemove] = useState<string>()
  const action = useAction()
  const save = (): void => {
    void action.run(async () => {
      await service.mutate(target, '/proxy/entries/add', { label: label.trim(), value: url.trim() })
      setLabel(''); setUrl('')
    }, text('代理已安全儲存。', 'Proxy saved.'))
  }
  return <div className="o-stack">
    <div className="o-muted-panel">{text('路由優先順序：帳號覆寫 → 提供者預設 → 共用代理 → Harness 環境。OAuth 回呼保留本機連線。', 'Routing priority: account override → provider default → shared proxy → Harness environment. OAuth callbacks remain local.')}</div>
    <div className="o-card"><h3>{text('已儲存的代理', 'Saved proxies')}</h3><p className="o-subtitle">{text('密碼只寫入憑證儲存區，不會由這個頁面讀回。', 'Passwords are written to the credential store and are never read back into this page.')}</p>
      {proxies.length ? proxies.map(proxy => <div className="o-list-row" key={proxy.id}><div className="o-grow"><strong>{proxy.label}</strong><div className="o-small o-code">{proxy.display}</div></div>{proxy.default ? <span className="o-badge">{text('共用預設', 'Shared default')}</span> : <Button disabled={action.pending || snapshot.busy} onClick={() => { void action.run(() => service.mutate(target, '/proxy/default', { proxyId: proxy.id }), text('共用預設已更新。', 'Shared default updated.')) }}>{text('設為預設', 'Make default')}</Button>}<Button danger disabled={action.pending} onClick={() => { setRemove(proxy.id) }}>{text('移除', 'Remove')}</Button></div>) : <div className="o-empty">{text('尚未設定外掛代理。目前使用 Harness 的網路設定。', 'No plugin proxies configured. Harness networking remains in control.')}</div>}
      {remove ? <div className="o-muted-panel o-stack"><p>{text('移除後，使用此代理的帳號會依序繼承其他路由。', 'After removal, affected accounts inherit the next available route.')}</p><div className="o-actions"><Button danger onClick={() => { void action.run(async () => { await service.mutate(target, '/proxy/entries/remove', { proxyId: remove }); setRemove(undefined) }, text('代理已移除。', 'Proxy removed.')) }}>{text('確認移除', 'Confirm removal')}</Button><Button onClick={() => { setRemove(undefined) }}>{text('取消', 'Cancel')}</Button></div></div> : null}
      <hr className="o-divider" />
      <form className="o-stack" onSubmit={event => { event.preventDefault(); save() }}><div className="o-fields"><label className="o-field">{text('顯示名稱', 'Display name')}<input required maxLength={80} value={label} placeholder={text('例如：工作網路', 'For example: Work network')} onChange={event => { setLabel(event.target.value) }} /></label><label className="o-field">{text('HTTP(S) 代理 URL', 'HTTP(S) proxy URL')}<input required type="password" autoComplete="new-password" value={url} placeholder="http://user:password@proxy:8080" onChange={event => { setUrl(event.target.value) }} /></label></div><div><Button type="submit" primary disabled={action.pending || !snapshot.data || !label.trim() || !url.trim()}>{action.pending ? text('儲存中…', 'Saving…') : text('新增代理', 'Add proxy')}</Button></div></form>
      <Notice notice={action.notice} />
    </div>
    <div className="o-card"><h3>{text('提供者指派', 'Provider assignments')}</h3>{PROVIDERS.map(p => <Assignment key={p.id} service={service} id={p.id} />)}<p className="o-small">{text('個別帳號的覆寫位於「帳號與額度 → 進階設定」。', 'Account overrides are under Accounts & quota → Advanced settings.')}</p></div>
  </div>
}
