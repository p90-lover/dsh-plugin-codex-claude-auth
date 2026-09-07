import type { ReactNode } from 'react'
import type { ProviderService } from './api.ts'
import type { ProviderId, ProviderStatus } from './contracts.ts'
import { Button, Notice, useAction, useLanguage, useProvider } from './ui.tsx'

type Entry = ProviderStatus['failover']['providers'][number]
function Destination({ service, target, entry, index, count, move }: { service: ProviderService; target: ProviderId; entry: Entry; index: number; count: number; move: (direction: -1 | 1) => Promise<unknown> }): ReactNode {
  const { text } = useLanguage()
  const action = useAction()
  const selected = entry.models.find(model => model.id === (entry.model ?? entry.defaultModel))
  const save = (path: string, body: object): void => { void action.run(() => service.mutate(target, path, { providerId: entry.id, ...body }), text('備援設定已儲存。', 'Fallback settings saved.')) }
  return <article className="o-card o-stack">
    <div className="o-between"><div className="o-actions"><span className="o-order">{index + 1}</span><div><h3>{entry.name}</h3><div className="o-small o-code">{entry.id}</div></div></div><label className="o-check"><input type="checkbox" checked={entry.enabled} disabled={action.pending || (!entry.available && !entry.enabled)} onChange={event => { save('/failover/enabled', { enabled: event.target.checked }) }} />{text('允許此目的地', 'Allow this destination')}</label></div>
    <div className="o-fields"><label className="o-field">{text('目的模型', 'Destination model')}<select value={entry.model ?? ''} disabled={action.pending || !entry.available} onChange={event => { save('/failover/model', { modelId: event.target.value || null }) }}><option value="">{text('自動選擇', 'Automatic')} · {entry.defaultModel ?? '—'}</option>{entry.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
      <label className="o-field">{text('推理強度', 'Reasoning effort')}<select value={selected?.efforts.some(e => e.id === entry.effort) ? entry.effort : ''} disabled={action.pending || !selected?.efforts.length} onChange={event => { save('/failover/effort', { effortId: event.target.value || null }) }}><option value="">{text('模型預設', 'Model default')} · {selected?.defaultEffort ?? '—'}</option>{selected?.efforts.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label></div>
    <div className="o-between"><span className="o-small">{entry.enabled ? text('失敗時可將對話送往這個目的地。', 'Conversation content may be sent here during fallback.') : text('未授權：不會自動將對話送到這裡。', 'Not authorized: no automatic conversation forwarding.')}</span><div className="o-actions"><Button aria-label={`${entry.name} ${text('上移', 'move up')}`} disabled={index === 0 || action.pending} onClick={() => { void action.run(() => move(-1), text('順序已更新。', 'Order updated.')) }}>↑</Button><Button aria-label={`${entry.name} ${text('下移', 'move down')}`} disabled={index === count - 1 || action.pending} onClick={() => { void action.run(() => move(1), text('順序已更新。', 'Order updated.')) }}>↓</Button></div></div>
    <Notice notice={action.notice} />
  </article>
}
export function FailoverPanel({ service }: { service: ProviderService }): ReactNode {
  const { text } = useLanguage()
  const a = useProvider(service, 'codex')
  const b = useProvider(service, 'claude')
  const target: ProviderId = a.data && !a.error ? 'codex' : 'claude'
  const entries = (target === 'codex' ? a : b).data?.failover.providers ?? []
  const available = entries.filter(entry => entry.available || entry.enabled)
  const unavailable = entries.filter(entry => !entry.available && !entry.enabled)
  const move = async (index: number, direction: -1 | 1): Promise<unknown> => {
    const order = available.map(entry => entry.id)
    const other = index + direction
    if (other < 0 || other >= order.length) return
    ;[order[index], order[other]] = [order[other]!, order[index]!]
    return service.mutate(target, '/failover/order', { order })
  }
  return <div className="o-stack">
    <div className="o-muted-panel"><strong>{text('先重試帳號，再嘗試已授權的提供者。', 'Retry an account first, then an authorized provider.')}</strong><p style={{ marginTop: 5 }}>{text('跨提供者備援預設關閉。只啟用你信任的目的地；對話可能包含專案內容。輸出或工具結果已提交後，不會自動重播。', 'Cross-provider fallback is off by default. Enable only trusted destinations: conversations may contain project data. Committed output or tool results are not automatically replayed.')}</p></div>
    {available.map((entry, index) => <Destination key={entry.id} service={service} target={target} entry={entry} index={index} count={available.length} move={direction => move(index, direction)} />)}
    {!available.length ? <div className="o-empty">{text('目前沒有可用的備援目的地。先連接帳號或啟用模型提供者。', 'No fallback destinations are available. Connect an account or enable a model provider first.')}</div> : null}
    {unavailable.length ? <details className="o-card"><summary>{text('未連接的提供者', 'Unavailable providers')} · {unavailable.length}</summary>{unavailable.map(entry => <div className="o-list-row" key={entry.id}><span>{entry.name}</span><span className="o-small">{text('尚未註冊可用路由或模型', 'No active route or models')}</span></div>)}</details> : null}
  </div>
}
