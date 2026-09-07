import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { ProviderId } from './contracts.ts'
import type { ProviderService } from './api.ts'
import { publicError } from '../public-error.ts'
import { remainingPercent } from './provider-usage.ts'

let language: 'zh' | 'en' | undefined
const languageListeners = new Set<() => void>()
function readLanguage(): 'zh' | 'en' {
  if (language !== undefined) return language
  try { language = localStorage.getItem('dsh.oauth.ui.language.v2') === 'en' ? 'en' : 'zh' } catch { language = 'zh' }
  return language
}
export function useLanguage() {
  const selected = useSyncExternalStore(
    useCallback((listener: () => void) => { languageListeners.add(listener); return () => { languageListeners.delete(listener) } }, []),
    readLanguage,
    () => 'zh' as const,
  )
  const set = (next: 'zh' | 'en'): void => {
    language = next
    try { localStorage.setItem('dsh.oauth.ui.language.v2', next) } catch { /* optional local preference */ }
    for (const listener of languageListeners) listener()
  }
  return { language: selected, setLanguage: set, text: (zh: string, en: string) => selected === 'zh' ? zh : en }
}
export function useProvider(service: ProviderService, id: ProviderId) {
  const snapshot = useSyncExternalStore(service.subscribe, () => service.snapshot(id), () => service.snapshot(id))
  useEffect(() => { void service.load(id) }, [service, id])
  return snapshot
}
export function useAction() {
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<{ error?: string; message?: string }>({})
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const run = async (operation: () => Promise<unknown>, message: string): Promise<boolean> => {
    if (pending) return false
    setPending(true); setNotice({})
    try {
      await operation()
      if (mounted.current) setNotice({ message })
      return true
    } catch (error) {
      if (mounted.current) setNotice({ error: publicError(error) })
      return false
    } finally { if (mounted.current) setPending(false) }
  }
  return { pending, notice, run }
}
export function Button({ primary = false, danger = false, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; danger?: boolean }): ReactNode {
  return <button type="button" className={`o-button ${primary ? 'o-primary' : ''} ${danger ? 'o-danger' : ''} ${className}`} {...props}>{children}</button>
}
export function Notice({ notice }: { notice: { error?: string; message?: string } }): ReactNode {
  if (notice.error) return <div className="o-notice o-error" role="alert">{notice.error}</div>
  if (notice.message) return <div className="o-notice o-success" role="status">{notice.message}</div>
  return null
}
export function Quota({ remaining, used, label }: { remaining?: number | undefined; used?: number | undefined; label: string }): ReactNode {
  const { text } = useLanguage()
  const percent = remainingPercent(remaining, used)
  return <div className="o-quota">
    <div className="o-between"><span>{label}</span><strong>{percent === undefined ? text('暫無資料', 'Unavailable') : `${percent}%`}</strong></div>
    {percent === undefined ? <div className="o-meter o-unknown" aria-label={text('尚未取得額度', 'Quota not reported')} />
      : <div className={`o-meter ${percent <= 10 ? 'o-low' : ''}`} role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>}
  </div>
}
export function resetTime(value: number | undefined): string {
  return value === undefined ? '—' : new Date(value * 1000).toLocaleString()
}
export function safeLoginUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    if (url.username || url.password) return undefined
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return url.href
  } catch { /* invalid provider URL */ }
  return undefined
}
