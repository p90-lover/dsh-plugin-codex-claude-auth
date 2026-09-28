import type { ReactNode } from 'react'
import type { ProviderService } from './api.ts'
import { PROVIDERS } from './contracts.ts'
import { Button, Notice, useAction, useLanguage, useProvider } from './ui.tsx'

export function DiagnosticsPanel({ service }: { service: ProviderService }): ReactNode {
  const { text } = useLanguage()
  const codex = useProvider(service, 'codex')
  const claude = useProvider(service, 'claude')
  const action = useAction()
  const states = { codex, claude }
  const download = async (): Promise<void> => {
    // Deliberate allowlist. No account labels, OAuth URLs, proxy URLs,
    // credentials, conversation contents, or raw provider errors are exported.
    const report = {
      schemaVersion: 1, generatedAt: new Date().toISOString(),
      providers: PROVIDERS.map(p => ({
        provider: p.id, signedIn: states[p.id].data?.connected ?? null,
        accountCount: states[p.id].data?.accounts.length ?? null,
        statusAvailable: !!states[p.id].data && !states[p.id].error,
        lastUpdated: states[p.id].updatedAt ?? null,
        context: states[p.id].data?.contextWindow?.selected ?? null,
        usageAvailable: states[p.id].data?.accounts.some(a => a.usage.source !== 'unavailable') ?? false,
      })),
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = 'dsh-oauth-diagnostics.json'
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="o-stack"><div className="o-card"><div className="o-between"><h3>{text('診斷快照', 'Diagnostics snapshot')}</h3><Button onClick={() => { void action.run(download, text('已建立去識別化診斷檔。', 'Redacted diagnostics file created.')) }}>{text('匯出診斷', 'Export diagnostics')}</Button></div><p className="o-subtitle">{text('「已登入」表示本機有登入資料，不代表外部服務目前可用。檢查失敗會保留真實錯誤。', '“Signed in” means credentials are stored locally, not that the remote service is healthy. Failed checks keep their actual error visible.')}</p>
    {PROVIDERS.map(p => <div className="o-list-row" key={p.id}><div><strong>{p.name}</strong><div className="o-small">{text('最後更新', 'Last updated')}: {states[p.id].updatedAt ? new Date(states[p.id].updatedAt!).toLocaleString() : '—'}</div></div><span className={`o-badge ${!states[p.id].error && states[p.id].data ? 'o-ok' : ''}`}>{states[p.id].error ? text('需要檢查', 'Needs attention') : states[p.id].data ? text('宿主已回應', 'Host responded') : text('尚未檢查', 'Not checked')}</span>{states[p.id].error ? <Notice notice={{ error: states[p.id].error! }} /> : null}</div>)}<Notice notice={action.notice} /></div>
    <div className="o-card o-stack"><h3>{text('安全與功能邊界', 'Safety and capability boundaries')}</h3><p className="o-small">{text('登入與設定請求由 Harness 的連線驗證保護。密鑰不會出現在診斷匯出。', 'Sign-in and settings requests use Harness connection authentication. Secrets are excluded from diagnostic exports.')}</p><p className="o-small">{text('備援是模型提供者切換，不是把同一個執行中的程序搬到另一個 Harness。不同應用程式的工具、審批和登入必須分別驗證。', 'Fallback switches model providers; it does not move a running process to another harness. Tools, approvals, and credentials must be verified independently in each application.')}</p><p className="o-small">{text('程式碼審查會向 DSH 排入唯讀審查指示。實際權限仍由目前的 DSH Preset 決定。', 'Code review queues read-only review instructions in DSH. Actual permissions remain controlled by the active DSH preset.')}</p></div>
  </div>
}
