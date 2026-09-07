import { useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ProviderService } from './api.ts'
import { Button, Notice, useAction, useLanguage } from './ui.tsx'
import { ProviderPanel } from './accounts.tsx'
import { ContextPanel } from './context-panel.tsx'
import { ProxyPanel } from './proxies.tsx'
import { FailoverPanel } from './failover-panel.tsx'
import { DiagnosticsPanel } from './diagnostics.tsx'
import { HandoffPanel } from './handoff-panel.tsx'
import { styles } from './styles.ts'

const TABS = [
  ['帳號與額度', 'Accounts & quota'], ['上下文', 'Context'], ['代理路由', 'Proxy routing'],
  ['自動備援', 'Fallback'], ['診斷', 'Diagnostics'], ['工作交接', 'Task handoff'],
] as const
export function ControlCenter({ service }: { service: ProviderService }): ReactNode {
  const locale = useLanguage()
  const { text } = locale
  const [tab, setTab] = useState(0)
  const identity = useId()
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const action = useAction()
  return <section className="dsh-oauth" aria-label={text('模型與帳號控制中心', 'Provider Control Center')}>
    <style>{styles}</style>
    <header className="o-header"><div><h2>{text('模型與帳號', 'Provider Control Center')}</h2><p className="o-subtitle">{text('登入、檢視額度，並管理每個請求的路由。', 'Connect accounts, understand quota, and control where requests go.')}</p></div><div className="o-actions"><div className="o-language" aria-label="Language"><button type="button" aria-pressed={locale.language === 'zh'} onClick={() => locale.setLanguage('zh')}>中文</button><button type="button" aria-pressed={locale.language === 'en'} onClick={() => locale.setLanguage('en')}>English</button></div><Button disabled={action.pending} onClick={() => { void action.run(() => service.refreshAll(), '') }}>{action.pending ? text('更新中…', 'Refreshing…') : text('更新狀態', 'Refresh status')}</Button></div></header>
    <div className="o-tabs" role="tablist" aria-label={text('管理功能', 'Management sections')}>
      {TABS.map(([zh, en], index) => <button key={en} ref={element => { buttons.current[index] = element }} type="button" role="tab" id={`${identity}-tab-${index}`} aria-selected={tab === index} aria-controls={`${identity}-panel-${index}`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : undefined
        if (next !== undefined) { event.preventDefault(); setTab(next); buttons.current[next]?.focus() }
      }}>{text(zh, en)}</button>)}
    </div>
    <div role="tabpanel" id={`${identity}-panel-${tab}`} aria-labelledby={`${identity}-tab-${tab}`}>
      {tab === 0 ? <div className="o-grid"><ProviderPanel service={service} id="codex" /><ProviderPanel service={service} id="claude" /></div> : tab === 1 ? <ContextPanel service={service} /> : tab === 2 ? <ProxyPanel service={service} /> : tab === 3 ? <FailoverPanel service={service} /> : tab === 4 ? <DiagnosticsPanel service={service} /> : <HandoffPanel />}
    </div>
    <Notice notice={action.notice} />
    <footer className="o-footer">{text('憑證留在本機 Harness。未知額度不會顯示成 100%，設定只在宿主確認後標示成功。', 'Credentials stay in the local Harness. Unknown quota is never shown as 100%; changes are confirmed only after the host acknowledges them.')}</footer>
  </section>
}
