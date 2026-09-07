import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ProviderService } from './api.ts'
import type { ProviderStatus } from './contracts.ts'
import { Button, Notice, useAction, useLanguage, useProvider } from './ui.tsx'
import { formatContextWindow } from './provider-usage.ts'

type Context = NonNullable<ProviderStatus['contextWindow']>
export function ContextEditor({ service, context, maximum, afterSave }: { service: ProviderService; context: Context; maximum?: number | undefined; afterSave?: (() => Promise<void>) | undefined }): ReactNode {
  const { text } = useLanguage()
  const [value, setValue] = useState(String(context.selected))
  const [editing, setEditing] = useState(!context.options.includes(context.selected))
  const action = useAction()
  const cap = maximum === undefined ? context.maximum : Math.min(context.maximum, maximum)
  const [error, setError] = useState('')
  useEffect(() => { setValue(String(context.selected)) }, [context.selected])
  const apply = (): void => {
    const amount = Number(value)
    if (!Number.isInteger(amount) || amount < context.minimum || amount > cap) {
      setError(text(`請輸入 ${context.minimum.toLocaleString()} 至 ${cap.toLocaleString()} 之間的整數。`, `Enter an integer from ${context.minimum.toLocaleString()} through ${cap.toLocaleString()}.`)); return
    }
    setError('')
    void action.run(async () => {
      await service.mutate('codex', '/context-window', { value: amount })
      await afterSave?.()
    }, text('設定已由宿主確認。下一個請求會使用新的有效上限。', 'Confirmed by the host. The next request uses the updated effective limit.'))
  }
  return <div className="o-stack">
    <div className="o-choice" aria-label={text('上下文選項', 'Context options')}>
      {context.options.map(option => <Button key={option} aria-pressed={!editing && Number(value) === option} disabled={action.pending || option > cap} title={option > cap ? text('超出此模型已知上限', 'Exceeds this model’s known limit') : ''} onClick={() => { setValue(String(option)); setEditing(false); setError('') }}>{formatContextWindow(option)}</Button>)}
      <Button aria-pressed={editing} disabled={action.pending || cap < context.minimum} onClick={() => { setEditing(true) }}>{text('自訂', 'Custom')}</Button>
    </div>
    {editing ? <label className="o-field">{text('自訂 tokens 數量', 'Custom token count')}<input type="number" min={context.minimum} max={cap} step={1} value={value} disabled={action.pending} onChange={event => { setValue(event.target.value) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply() } }} /></label> : null}
    <div className="o-small">{text('模型能力不會因為調高設定而增加；有效上限以提供者回傳的能力為準。', 'A larger setting does not increase model capability. Provider-reported limits still apply.')}</div>
    {cap < context.minimum ? <div className="o-muted-panel">{text('此模型的上限低於可選範圍，系統會自動使用模型上限。', 'This model has a lower limit than the selectable range. Its native limit is used automatically.')}</div> : <Button primary disabled={action.pending || Number(value) === context.selected} onClick={apply}>{action.pending ? text('套用中…', 'Applying…') : text('套用上下文', 'Apply context')}</Button>}
    <Notice notice={error ? { error } : action.notice} />
  </div>
}
export function ContextPanel({ service }: { service: ProviderService }): ReactNode {
  const { text } = useLanguage()
  const snapshot = useProvider(service, 'codex')
  const context = snapshot.data?.contextWindow
  if (!context) return <div className="o-empty">{snapshot.error ?? text('尚未取得 OpenAI 上下文設定。請重新整理連線狀態。', 'OpenAI context settings are unavailable. Refresh the connection status.')}</div>
  return <div className="o-stack">
    <div className="o-card"><div className="o-between" style={{ marginBottom: 18 }}><div><h3>{text('OpenAI 上下文預算', 'OpenAI context budget')}</h3><p className="o-subtitle">{text('已儲存的要求值，會依每個模型的實際能力套用。', 'Your saved preference, bounded by each model’s actual capability.')}</p></div><div className="o-metric">{formatContextWindow(context.selected)}</div></div><ContextEditor service={service} context={context} /></div>
    <div className="o-card"><h3>{text('模型有效上限', 'Effective model limits')}</h3><p className="o-subtitle">{text('這是能力檢視，不會變更對話所選模型。', 'Capability reference only; this does not change your selected conversation model.')}</p>
      {Object.entries(context.modelLimits ?? {}).map(([model, capacity]) => <div className="o-list-row" key={model}><span className="o-code">{model}</span><span>{formatContextWindow(Math.min(capacity, context.selected))}<span className="o-small"> / {formatContextWindow(capacity)}</span></span></div>)}
      {!Object.keys(context.modelLimits ?? {}).length ? <div className="o-empty">{text('模型目錄尚未回傳容量。', 'Model capacity has not been reported yet.')}</div> : null}
    </div>
    <div className="o-muted-panel">{text('自動壓縮由 DSH 的 Agent Preset 管理；這個外掛不會新增第二個壓縮服務。OpenAI 遠端壓縮失敗時，交回 DSH 本機摘要流程。', 'Automatic compaction belongs to the DSH agent preset. This plugin does not add a second compaction service; failed OpenAI remote compaction falls back to DSH summarization.')}</div>
  </div>
}
