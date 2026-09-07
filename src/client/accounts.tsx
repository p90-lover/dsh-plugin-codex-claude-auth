import { useEffect, useState } from 'react'
import { publicError } from '../public-error.ts'
import type { ReactNode } from 'react'
import type { ProviderService } from './api.ts'
import { PROVIDERS } from './contracts.ts'
import type { FlowState, ProviderId, ProviderStatus } from './contracts.ts'
import { Button, Notice, Quota, resetTime, safeLoginUrl, useAction, useLanguage, useProvider } from './ui.tsx'

type Account = ProviderStatus['accounts'][number]
function terminal(flow: FlowState): boolean { return ['complete', 'error', 'cancelled'].includes(flow.phase) }

export function SignIn({ service, id, onClose }: { service: ProviderService; id: ProviderId; onClose: () => void }): ReactNode {
  const { text } = useLanguage()
  const [flow, setFlow] = useState<FlowState>()
  const [pollError, setPollError] = useState<string>()
  const [value, setValue] = useState('')
  const action = useAction()
  useEffect(() => {
    let alive = true
    void action.run(async () => {
      const next = await service.flow(id, '/start', {})
      if (alive) setFlow(next)
    }, '')
    return () => { alive = false }
  }, [service, id])
  useEffect(() => {
    if (!flow || terminal(flow)) return
    let alive = true
    let pending = false
    const timer = setInterval(() => {
      if (pending) return
      pending = true
      void service.flow(id, `/state?flowId=${encodeURIComponent(flow.id)}`).then(next => {
        if (!alive) return
        setFlow(next)
        setPollError(undefined)
        if (terminal(next)) void service.load(id, true)
      }, error => { if (alive) setPollError(publicError(error)) }).finally(() => { pending = false })
    }, 1500)
    return () => { alive = false; clearInterval(timer) }
  }, [service, id, flow?.id, flow?.phase])
  const url = safeLoginUrl(flow?.authUrl ?? flow?.deviceCode?.verificationUri)
  const answer = (input: string): void => {
    if (!flow?.prompt) return
    void action.run(async () => {
      setFlow(await service.flow(id, '/respond', { flowId: flow.id, promptId: flow.prompt!.id, value: input }))
      setValue('')
    }, '')
  }
  const cancel = (): void => {
    if (!flow || terminal(flow)) { onClose(); return }
    void action.run(async () => { setFlow(await service.flow(id, '/cancel', { flowId: flow.id })); setValue('') }, text('登入已取消。', 'Sign-in cancelled.'))
  }
  return <div className="o-muted-panel o-stack" aria-label={text('登入流程', 'Sign-in flow')}>
    <strong>{text('連接你的帳號', 'Connect your account')}</strong>
    <p>{flow?.progress ?? text('正在建立安全登入流程…', 'Starting the sign-in flow…')}</p>
    {url ? <a className="o-button o-primary" href={url} target="_blank" rel="noopener noreferrer">{text('開啟提供者登入頁', 'Open provider sign-in')}</a> : null}
    {flow?.deviceCode ? <div className="o-flow-code">{flow.deviceCode.userCode}</div> : null}
    {flow?.prompt?.type === 'select' ? <div className="o-stack"><p>{flow.prompt.message}</p>{flow.prompt.options?.map(option => <Button key={option.id} disabled={action.pending} onClick={() => { answer(option.id) }}>{option.label}</Button>)}</div> : null}
    {flow?.prompt && flow.prompt.type !== 'select' ? <form className="o-stack" onSubmit={event => { event.preventDefault(); answer(value) }}>
      <label className="o-field">{flow.prompt.message}<input type={flow.prompt.type === 'secret' ? 'password' : 'text'} value={value} autoComplete="off" spellCheck={false} onChange={event => { setValue(event.target.value) }} /></label>
      <Button type="submit" primary disabled={action.pending || !value.trim()}>{text('提交並繼續', 'Submit and continue')}</Button>
    </form> : null}
    {pollError ? <Notice notice={{ error: pollError }} /> : null}
    {flow?.error ? <Notice notice={{ error: flow.error }} /> : null}
    {flow?.phase === 'complete' ? <Notice notice={{ message: text('登入資料已儲存。', 'Sign-in credentials saved.') }} /> : null}
    <Notice notice={action.notice} />
    <div className="o-actions">
      <Button disabled={action.pending} onClick={cancel}>{flow && terminal(flow) ? text('完成', 'Done') : text('取消登入', 'Cancel sign-in')}</Button>
      {flow && !terminal(flow) ? <Button disabled={action.pending} onClick={() => { void action.run(async () => { setFlow(await service.flow(id, `/state?flowId=${encodeURIComponent(flow.id)}`)) }, '') }}>{text('重新檢查狀態', 'Check status again')}</Button> : null}
    </div>
  </div>
}

function AccountAdvanced({ service, id, account, status }: { service: ProviderService; id: ProviderId; account: Account; status: ProviderStatus }): ReactNode {
  const { text } = useLanguage()
  const action = useAction()
  const entry = status.failover.providers.find(item => item.id === PROVIDERS.find(p => p.id === id)!.route)
  const selectedModel = entry?.models.find(model => model.id === (account.failoverModel ?? entry.model ?? entry.defaultModel))
  const save = (path: string, body: object): void => { void action.run(() => service.mutate(id, path, { accountId: account.id, ...body }), text('帳號設定已儲存。', 'Account settings saved.')) }
  return <details><summary>{text('此帳號的進階設定', 'Advanced settings for this account')}</summary>
    <div className="o-stack">
      <label className="o-field">{text('代理路由', 'Proxy route')}<select value={account.proxyId ?? ''} disabled={action.pending} onChange={event => { save('/account/proxy', { proxyId: event.target.value || null }) }}>
        <option value="">{text('繼承提供者設定', 'Inherit provider settings')}</option>
        {status.proxy.entries.map(proxy => <option key={proxy.id} value={proxy.id}>{proxy.label} · {proxy.display}</option>)}
      </select></label>
      {entry ? <div className="o-fields">
        <label className="o-field">{text('備援模型', 'Fallback model')}<select value={account.failoverModel ?? ''} disabled={action.pending || !entry.available} onChange={event => { save('/account/failover-model', { modelId: event.target.value || null }) }}>
          <option value="">{text('繼承提供者設定', 'Inherit provider settings')}</option>{entry.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
        </select></label>
        <label className="o-field">{text('備援推理強度', 'Fallback reasoning effort')}<select value={selectedModel?.efforts.some(e => e.id === account.failoverEffort) ? account.failoverEffort : ''} disabled={action.pending || !selectedModel?.efforts.length} onChange={event => { save('/account/failover-effort', { effortId: event.target.value || null }) }}>
          <option value="">{text('繼承模型／提供者預設', 'Inherit model/provider default')}</option>{selectedModel?.efforts.map(effort => <option key={effort.id} value={effort.id}>{effort.name}</option>)}
        </select></label>
      </div> : null}
      {id === 'codex' ? <label className="o-check"><input type="checkbox" checked={account.useResetCredit} disabled={action.pending} onChange={event => { save('/account/reset-credit', { enabled: event.target.checked }) }} /><span>{text('額度耗盡時，自動兌換可用的重設額度', 'Automatically redeem available reset credits when exhausted')}<span className="o-small"> · {account.usage.resetCredits ?? '—'}</span></span></label> : null}
      <Notice notice={action.notice} />
    </div>
  </details>
}

export function ProviderPanel({ service, id }: { service: ProviderService; id: ProviderId }): ReactNode {
  const { text } = useLanguage()
  const snapshot = useProvider(service, id)
  const provider = PROVIDERS.find(item => item.id === id)!
  const action = useAction()
  const [signingIn, setSigningIn] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const data = snapshot.data
  return <article className="o-card" aria-label={provider.name} data-provider-panel={id}>
    <div className="o-card-head"><span className="o-logo" aria-hidden="true">{provider.mark}</span><div className="o-grow"><h3>{provider.name}</h3><div className="o-small">{id === 'codex' ? 'ChatGPT OAuth' : 'Claude OAuth'}</div></div><span className={`o-badge ${data?.connected && !snapshot.error ? 'o-ok' : ''}`}><span className="o-dot" />{snapshot.error ? text('狀態未知', 'Unknown') : data?.connected ? text('已登入', 'Signed in') : snapshot.loading ? text('讀取中', 'Loading') : text('尚未登入', 'Not signed in')}</span></div>
    {snapshot.error ? <Notice notice={{ error: snapshot.error }} /> : null}
    {data?.accounts.length ? data.accounts.map(account => <div className="o-account" key={account.id}>
      <div className="o-between"><span className="o-account-name">{account.label}</span>{account.active ? <span className="o-badge o-ok">{text('使用中', 'Active')}</span> : <Button disabled={snapshot.busy || action.pending} onClick={() => { void action.run(() => service.mutate(id, '/account/select', { accountId: account.id }), text('已切換帳號。', 'Account switched.')) }}>{text('使用此帳號', 'Use account')}</Button>}</div>
      {id === 'claude' ? <>
        <Quota label={text('5 小時剩餘額度', '5-hour remaining')} remaining={account.usage.windows?.find(w => w.id === 'five-hour')?.remainingPercent} />
        <Quota label={text('每週剩餘額度', 'Weekly remaining')} remaining={account.usage.windows?.find(w => w.id === 'weekly')?.remainingPercent} />
      </> : <Quota label={text('剩餘額度', 'Remaining quota')} remaining={account.usage.remainingPercent} used={account.usage.usedPercent} />}
      <div className="o-small" style={{ marginTop: 8 }}>{text('下次重設', 'Next reset')} · {resetTime(account.usage.resetsAt)}</div>
      {account.usage.error ? <div className="o-small" style={{ marginTop: 5 }}>{text('未能更新額度：', 'Quota update failed: ')}{account.usage.error}</div> : null}
      <AccountAdvanced service={service} id={id} account={account} status={data} />
    </div>) : <div className="o-empty">{snapshot.loading ? text('正在讀取帳號…', 'Loading accounts…') : text('連接帳號後，在這裡管理額度與備援設定。', 'Connect an account to manage quota and fallback settings here.')}</div>}
    <div className="o-actions" style={{ marginTop: 16 }}>
      <Button primary disabled={signingIn || snapshot.busy} onClick={() => { setSigningIn(true) }}>{data?.connected ? text('新增帳號', 'Add account') : text('連接帳號', 'Connect account')}</Button>
      <Button disabled={action.pending || snapshot.busy || snapshot.loading} onClick={() => { void action.run(() => service.mutate(id, '/refresh', {}), text('帳號與模型已重新整理。', 'Account and models refreshed.')) }}>{text('重新整理', 'Refresh')}</Button>
      {data?.connected ? <Button danger disabled={action.pending} onClick={() => { setConfirmLogout(true) }}>{text('登出', 'Sign out')}</Button> : null}
    </div>
    {confirmLogout ? <div className="o-muted-panel o-stack" style={{ marginTop: 12 }} role="group" aria-label={text('確認登出', 'Confirm sign out')}>
      <p>{text('移除此提供者所有本機登入？不會刪除對話。遠端授權需到提供者網站撤銷。', 'Remove all local sign-ins for this provider? Conversations stay intact. Revoke remote grants on the provider website.')}</p>
      <div className="o-actions"><Button danger disabled={action.pending} onClick={() => { void action.run(async () => { await service.mutate(id, '/logout', {}); setConfirmLogout(false) }, text('本機登入已移除。', 'Local sign-ins removed.')) }}>{text('確認登出', 'Confirm sign out')}</Button><Button onClick={() => { setConfirmLogout(false) }}>{text('保留登入', 'Keep signed in')}</Button></div>
    </div> : null}
    <Notice notice={action.notice} />
    {signingIn ? <SignIn service={service} id={id} onClose={() => { setSigningIn(false); void service.load(id, true) }} /> : null}
  </article>
}
