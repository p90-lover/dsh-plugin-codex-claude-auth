import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { ModelDirectory } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { ProviderService } from './api.ts'
import type { ProviderId } from './contracts.ts'
import { Button, useLanguage, useProvider } from './ui.tsx'
import { ContextEditor } from './context-panel.tsx'
import { formatContextWindow, providerIdFromRoute, remainingPercent } from './provider-usage.ts'
import { styles } from './styles.ts'

export interface ComposerProps {
  service: ProviderService
  directory: ModelDirectory
  available: boolean
}
export function ComposerStatus({ service, directory, available }: ComposerProps): ReactNode {
  const state = useSyncExternalStore(directory.store.subscribe, directory.store.getSnapshot, directory.store.getSnapshot)
  const provider = providerIdFromRoute(state.current?.provider)
  if (!available || !provider) return null
  return <ActiveStatus key={provider} service={service} provider={provider} model={state.current?.model ?? ''} directory={directory} />
}
function ActiveStatus({ service, provider, model, directory }: { service: ProviderService; provider: ProviderId; model: string; directory: ModelDirectory }): ReactNode {
  const { text } = useLanguage()
  const state = useProvider(service, provider)
  const active = state.data?.accounts.find(account => account.active)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const amount = (remaining?: number, used?: number): string => {
    const value = remainingPercent(remaining, used)
    return value === undefined ? '—' : `${value}%`
  }
  const five = active?.usage.windows?.find(w => w.id === 'five-hour')
  const week = active?.usage.windows?.find(w => w.id === 'weekly')
  const quota = provider === 'codex' ? amount(active?.usage.remainingPercent, active?.usage.usedPercent)
    : `5h ${amount(five?.remainingPercent)} · 7d ${amount(week?.remainingPercent)}`
  const context = provider === 'codex' ? state.data?.contextWindow : undefined
  const nativeCapacity = context?.modelLimits?.[model]
  const effective = context === undefined || nativeCapacity === undefined ? undefined : Math.min(context.selected, nativeCapacity)
  return <div ref={root} className="dsh-oauth o-composer" data-active-provider={provider} onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); trigger.current?.focus() } }}>
    <style>{styles}</style><div className="o-compact">
      <span className="o-small">{provider === 'codex' ? 'OpenAI' : 'Claude'} · {state.error ? text('額度暫不可用', 'Quota unavailable') : state.loading && !state.data ? text('讀取中…', 'Loading…') : `${text('剩餘', 'Remaining')} ${quota}`}</span>
      {context ? <button ref={trigger} type="button" className="o-button" aria-expanded={open} aria-label={text('管理 OpenAI 上下文', 'Manage OpenAI context')} onClick={() => setOpen(!open)}>{text('上下文', 'Context')}{effective !== undefined ? ` ${formatContextWindow(effective)}` : ''}</button> : null}
    </div>
    {open && context ? <div className="o-popover" role="group" aria-label={text('OpenAI 上下文設定', 'OpenAI context settings')}><div className="o-between"><h3>{text('上下文預算', 'Context budget')}</h3><Button onClick={() => { setOpen(false); trigger.current?.focus() }} aria-label={text('關閉上下文設定', 'Close context settings')}>×</Button></div><ContextEditor service={service} context={context} maximum={nativeCapacity} afterSave={async () => { await directory.load() }} /></div> : null}
  </div>
}
