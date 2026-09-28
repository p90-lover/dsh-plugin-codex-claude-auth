import { useState } from 'react'
import type { ReactNode } from 'react'
import { createHandoff, renderHandoff } from '../handoff.ts'
import { Button, Notice, useAction, useLanguage } from './ui.tsx'

/** Explicitly manual transfer: no CLI process, secret, or permission migration. */
export function HandoffPanel(): ReactNode {
  const { text } = useLanguage()
  const [goal, setGoal] = useState('')
  const [summary, setSummary] = useState('')
  const [steps, setSteps] = useState('')
  const [files, setFiles] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const action = useAction()
  const exportPacket = (format: 'json' | 'md'): void => {
    void action.run(async () => {
      const packet = createHandoff({ goal, summary, nextSteps: steps.split('\n'), files: files.split('\n') })
      const content = format === 'json' ? JSON.stringify(packet, null, 2) : renderHandoff(packet)
      const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' }))
      const link = document.createElement('a'); link.href = url; link.download = `task-handoff.${format}`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, text('交接檔已建立。目標應用程式尚未啟動。', 'Handoff file created. No destination application was started.'))
  }
  const change = (setter: (value: string) => void, value: string): void => { setter(value); setReviewed(false) }
  return <div className="o-card o-stack"><h3>{text('跨 Harness 工作交接', 'Cross-harness task handoff')}</h3>
    <p className="o-subtitle">{text('把已確認的任務摘要帶到 DSH、Codex 或 Claude Code 的新會話。這是手動交接，不會搬移登入、工具權限、原生會話記錄，也不會自動執行命令。', 'Carry a reviewed task summary into a new DSH, Codex, or Claude Code session. This is manual handoff: no credentials, tool permissions, native transcripts, or commands are transferred or executed.')}</p>
    <label className="o-field">{text('任務目標', 'Task goal')}<input maxLength={2000} value={goal} onChange={e => change(setGoal, e.target.value)} /></label>
    <label className="o-field">{text('已完成的工作與重要決定', 'Completed work and important decisions')}<textarea rows={5} maxLength={16000} value={summary} onChange={e => change(setSummary, e.target.value)} /></label>
    <div className="o-fields"><label className="o-field">{text('下一步（每行一項）', 'Next steps (one per line)')}<textarea rows={4} value={steps} onChange={e => change(setSteps, e.target.value)} /></label><label className="o-field">{text('專案相對路徑（每行一項）', 'Workspace-relative paths (one per line)')}<textarea rows={4} value={files} onChange={e => change(setFiles, e.target.value)} /></label></div>
    <label className="o-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /><span>{text('目前工作與工具已停止；我已確認內容沒有密鑰，並會在目標端重新檢查登入與權限。', 'The source turn and tools have stopped. I reviewed this content for secrets and will re-check destination authentication and permissions.')}</span></label>
    <div className="o-actions"><Button primary disabled={!reviewed || !goal.trim() || action.pending} onClick={() => exportPacket('md')}>{text('匯出可讀摘要', 'Export readable summary')}</Button><Button disabled={!reviewed || !goal.trim() || action.pending} onClick={() => exportPacket('json')}>{text('匯出交接 JSON', 'Export handoff JSON')}</Button></div><Notice notice={action.notice} />
    <p className="o-small">{text('檔案只包含你在上面填寫的內容，不會讀取本機專案檔案。秘密偵測只能輔助檢查，不能取代人工檢閱。', 'Only the content entered above is exported; no project files are read. Secret-pattern checks assist review but cannot replace it.')}</p>
  </div>
}
