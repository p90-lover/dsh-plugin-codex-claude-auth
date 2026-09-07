import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ModelDirectory } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { Button, Notice, useAction, useLanguage } from './ui.tsx'
import { styles } from './styles.ts'

export interface ReviewResult { started: boolean; message: string }
export interface ReviewInjected {
  directory: ModelDirectory
  checkAvailable(): Promise<boolean>
  runReview(mode: 'manual' | 'auto'): Promise<ReviewResult>
}
export type ReviewProps = PropsRuntime<'conversation.input.dock'> & ReviewInjected
const KEY = 'dsh.oauthModelProviders.autoCodeReview'
export function ReviewWidget({ directory, useChat, useSession, checkAvailable, runReview }: ReviewProps): ReactNode {
  const { text } = useLanguage()
  const state = useSyncExternalStore(directory.store.subscribe, directory.store.getSnapshot, directory.store.getSnapshot)
  const chat = useChat(value => value.legacy)
  const running = useSession(value => value.running)
  const [available, setAvailable] = useState(false)
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem(KEY) === 'true' } catch { return false } })
  const action = useAction()
  const completion = [...chat.turnEnds.entries()].sort((a, b) => b[1] - a[1])[0]
  const seen = useRef(completion?.[1])
  const skip = useRef(false)
  useEffect(() => { let alive = true; void checkAvailable().then(value => { if (alive) setAvailable(value) }, () => { if (alive) setAvailable(false) }); return () => { alive = false } }, [checkAvailable])
  const run = async (mode: 'manual' | 'auto'): Promise<void> => {
    await action.run(async () => {
      const result = await runReview(mode)
      if (result.started) skip.current = true
      if (!result.started && !result.message) throw new Error('The host did not acknowledge the review request.')
      setResult(result.message)
    }, '')
  }
  const [result, setResult] = useState('')
  useEffect(() => {
    if (running || !completion || completion[1] === seen.current) return
    seen.current = completion[1]
    if (skip.current) { skip.current = false; return }
    if (!auto || !available || action.pending || state.current?.provider !== 'openai-codex-oauth') return
    const last = [...chat.nodes].reverse().find(n => n.kind === 'assistant' && n.turn === completion[0])
    if (last?.kind === 'assistant' && last.provenance?.provider === 'openai-codex-oauth') void run('auto')
  }, [running, completion?.[1], auto, available, state.current?.provider])
  if (state.current?.provider !== 'openai-codex-oauth') return null
  return <div className="dsh-oauth"><style>{styles}</style><div className="o-review"><span>{text('程式碼審查', 'Code review')}</span><div className="o-actions"><Button disabled={!available || running || action.pending} title={!available ? text('此工作階段未提供 /review 指令', 'The /review command is not available in this session') : text('排入唯讀審查指示；權限仍由 DSH 管理', 'Queue read-only review instructions; DSH still manages permissions')} onClick={() => { setResult(''); void run('manual') }}>{action.pending ? text('送出中…', 'Submitting…') : text('開始審查', 'Start review')}</Button><label className="o-check"><input type="checkbox" checked={auto} disabled={!available} onChange={event => { const next = event.target.checked; setAuto(next); try { localStorage.setItem(KEY, String(next)) } catch { /* optional local setting */ } }} />{text('回合完成後自動審查', 'Auto-review after each turn')}</label></div></div><Notice notice={action.notice} />{result ? <div className="o-feedback" role="status">{result}</div> : null}</div>
}
