import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

const enBase = {
  nav: 'OAuth Providers',
  title: 'Add Codex or Claude OAuth',
  intro: 'Sign in entirely from this Settings page. No command or chat session is required.',
  language: 'Language',
  english: 'English',
  traditionalChinese: '繁體中文',
  security: 'OAuth tokens and proxy URLs stay in the DeepSeek Harness credential store. This page receives only connection state, public sign-in instructions, and a redacted proxy host.',
  codexName: 'OpenAI Codex',
  codexDescription: 'Use your ChatGPT subscription through the OpenAI Codex OAuth flow.',
  claudeName: 'Anthropic Claude',
  claudeDescription: 'Use a Claude Pro or Max account through the Anthropic OAuth flow.',
  connected: 'Connected',
  disconnected: 'Not connected',
  checking: 'Checking…',
  unavailable: 'Status unavailable',
  addCodex: 'Add Codex OAuth',
  addClaude: 'Add Claude OAuth',
  disconnect: 'Disconnect',
  starting: 'Starting…',
  routeReady: 'Models are available in the model picker.',
  routeHidden: 'Models stay hidden from the model picker until sign-in succeeds.',
  retry: 'Retry status',
  failed: 'OAuth request failed',
  proxyTitle: 'Provider proxy',
  proxyHelp: 'Optional. Routes this provider’s OAuth token exchange, refresh, and model traffic. HTTP and HTTPS proxies only.',
  proxyBrowserNote: 'The provider sign-in website still uses your browser’s own network or proxy settings.',
  proxyPlaceholder: 'http://user:password@proxy.example:8080',
  proxyConfigured: 'Configured: {proxy}',
  proxyNotConfigured: 'No proxy configured',
  saveProxy: 'Save proxy',
  replaceProxy: 'Replace proxy',
  removeProxy: 'Remove proxy',
  savingProxy: 'Saving…',
  proxySaved: 'Proxy saved securely.',
  proxyRemoved: 'Proxy removed.',
  chooseMethod: 'Choose a sign-in method',
  openSignIn: 'Open sign-in page',
  autoCallback: 'Monitoring the local OAuth callback automatically. This card will switch to Connected when the browser returns.',
  manualFallback: 'If the browser cannot reach the local callback, paste the returned URL or authorization code here.',
  submitCode: 'Submit code',
  deviceCode: 'Device code',
  openVerification: 'Open verification page',
  waiting: 'Waiting for authorization…',
  cancel: 'Cancel sign-in',
  completed: 'Sign-in completed. The provider models are now available.',
  cancelled: 'Sign-in cancelled.',
}

const zhBase: { [Key in keyof typeof enBase]: string } = {
  nav: 'OAuth 提供者',
  title: '新增 Codex 或 Claude OAuth',
  intro: '直接在此設定頁完成登入，不需要指令或聊天工作階段。',
  language: '語言',
  english: 'English',
  traditionalChinese: '繁體中文',
  security: 'OAuth 權杖與代理伺服器網址只會保存在 DeepSeek Harness 的憑證儲存區。此頁只會收到連線狀態、公開登入指示，以及已遮蔽的代理主機。',
  codexName: 'OpenAI Codex',
  codexDescription: '透過 OpenAI Codex OAuth 流程使用你的 ChatGPT 訂閱。',
  claudeName: 'Anthropic Claude',
  claudeDescription: '透過 Anthropic OAuth 流程使用 Claude Pro 或 Max 帳號。',
  connected: '已連線',
  disconnected: '尚未連線',
  checking: '檢查中…',
  unavailable: '無法取得狀態',
  addCodex: '新增 Codex OAuth',
  addClaude: '新增 Claude OAuth',
  disconnect: '中斷連線',
  starting: '啟動中…',
  routeReady: '模型現在可在模型選擇器中使用。',
  routeHidden: '登入成功前，模型不會出現在模型選擇器中。',
  retry: '重新檢查狀態',
  failed: 'OAuth 請求失敗',
  proxyTitle: '提供者代理伺服器',
  proxyHelp: '選用。此提供者的 OAuth 權杖交換、重新整理及模型流量會使用這個代理。只支援 HTTP 與 HTTPS。',
  proxyBrowserNote: '提供者的登入網站仍會使用瀏覽器本身的網路或代理設定。',
  proxyPlaceholder: 'http://使用者:密碼@proxy.example:8080',
  proxyConfigured: '已設定：{proxy}',
  proxyNotConfigured: '尚未設定代理伺服器',
  saveProxy: '儲存代理',
  replaceProxy: '更換代理',
  removeProxy: '移除代理',
  savingProxy: '儲存中…',
  proxySaved: '代理已安全儲存。',
  proxyRemoved: '代理已移除。',
  chooseMethod: '選擇登入方式',
  openSignIn: '開啟登入頁面',
  autoCallback: '正在自動監看本機 OAuth 回呼。瀏覽器返回後，此卡片會自動切換成「已連線」。',
  manualFallback: '如果瀏覽器無法連到本機回呼，請在這裡貼上返回的網址或授權碼。',
  submitCode: '送出授權碼',
  deviceCode: '裝置代碼',
  openVerification: '開啟驗證頁面',
  waiting: '正在等待授權…',
  cancel: '取消登入',
  completed: '登入完成，提供者模型現在可使用。',
  cancelled: '登入已取消。',
}

const en = {
  ...enBase,
  accounts: 'Accounts', activeAccount: 'Active', useAccount: 'Use account',
  refreshSession: 'Refresh provider session', refreshUsage: 'Refresh usage',
  usageUnavailable: 'Usage unavailable', usageDetails: '{used}% used · {remaining}% left · resets {reset}',
  resetCredits: '{count} reset credit(s)',
  useResetCredit: 'Use an earned reset credit when this account is exhausted',
  sharedProxy: 'Both providers (shared)', codexProxy: 'Codex only', claudeProxy: 'Claude only',
  proxyScope: 'Apply proxy to', sharedProxySource: 'Shared proxy', providerProxySource: 'Provider-only proxy',
  reuseForBoth: 'Use this saved proxy for both providers',
  claudeUsageHelp: 'Claude fallback: enter the used percentage and optional reset time from your plan.',
  saveClaudeUsage: 'Save Claude usage',
  codexFeatures: 'Codex workflow features',
  remoteCompaction: 'Remote compaction is automatic for OpenAI OAuth. If the preview endpoint is unavailable, DSH safely falls back to its local summary compaction.',
  codeReviewHelp: 'Use Code review for a dedicated read-only review, or leave Auto review enabled to review only new OpenAI changes. Findings stay in chat.',
  toolCallingHelp: 'DSH tool definitions, streamed calls, call IDs, results, and replay history are preserved end to end for OpenAI Codex.',
  codeReview: 'Code review',
  codeReviewTitle: 'Review uncommitted changes without modifying files',
  codeReviewFailed: 'Code review could not start',
  autoCodeReviewOn: 'Auto review: On',
  autoCodeReviewOff: 'Auto review: Off',
  autoCodeReviewTitle: 'Automatically review new uncommitted changes after an OpenAI Codex turn',
}

const zh: { [Key in keyof typeof en]: string } = {
  ...zhBase,
  accounts: '帳戶', activeAccount: '使用中', useAccount: '使用此帳戶',
  refreshSession: '重新整理提供者工作階段', refreshUsage: '重新整理用量',
  usageUnavailable: '無法取得用量', usageDetails: '已用 {used}% · 剩餘 {remaining}% · {reset} 重設',
  resetCredits: '{count} 個重設額度',
  useResetCredit: '此帳戶用量耗盡時使用已取得的重設額度',
  sharedProxy: '兩個提供者（共用）', codexProxy: '僅 Codex', claudeProxy: '僅 Claude',
  proxyScope: '套用代理至', sharedProxySource: '共用代理', providerProxySource: '提供者專用代理',
  reuseForBoth: '將此已儲存代理用於兩個提供者',
  claudeUsageHelp: 'Claude 備援：輸入方案顯示的已用百分比及選用重設時間。',
  saveClaudeUsage: '儲存 Claude 用量',
  codexFeatures: 'Codex 工作流程功能',
  remoteCompaction: 'OpenAI OAuth 會自動使用遠端壓縮。若預覽端點無法使用，DSH 會安全地退回本機摘要壓縮。',
  codeReviewHelp: '使用「程式碼審查」執行專用唯讀審查，或保持「自動審查」開啟，只審查新的 OpenAI 變更；結果會保留在聊天中。',
  toolCallingHelp: 'OpenAI Codex 會端對端保留 DSH 工具定義、串流呼叫、呼叫 ID、工具結果與重播記錄。',
  codeReview: '程式碼審查',
  codeReviewTitle: '審查未提交變更，不修改任何檔案',
  codeReviewFailed: '無法啟動程式碼審查',
  autoCodeReviewOn: '自動審查：開啟',
  autoCodeReviewOff: '自動審查：關閉',
  autoCodeReviewTitle: 'OpenAI Codex 回合完成後，自動審查新的未提交變更',
}

type OAuthSettingsKey = keyof typeof en
type ProviderId = 'codex' | 'claude'
type ProxyScope = 'shared' | ProviderId
type Language = 'en' | 'zh-TW'
type Phase = 'starting' | 'input' | 'authorizing' | 'device_code' | 'complete' | 'error' | 'cancelled'

interface ProviderStatus {
  connected: boolean
  accounts: readonly OAuthAccount[]
  proxy: {
    configured: boolean
    display?: string
    source?: 'shared' | 'provider'
    providerConfigured: boolean
    sharedConfigured: boolean
  }
}

interface OAuthAccount {
  id: string
  label: string
  active: boolean
  useResetCredit: boolean
  configuredUsage?: { usedPercent: number; resetsAt?: number }
  usage: {
    usedPercent?: number
    remainingPercent?: number
    resetsAt?: number
    resetCredits?: number
    source: 'openai-live' | 'configured' | 'unavailable'
    error?: string
  }
}

interface FlowPrompt {
  id: string
  type: 'text' | 'secret' | 'select' | 'manual_code'
  message: string
  placeholder?: string
  options?: readonly { id: string; label: string; description?: string }[]
}

interface FlowState {
  id: string
  providerName: string
  phase: Phase
  revision: number
  connected: boolean
  prompt?: FlowPrompt
  authUrl?: string
  authInstructions?: string
  deviceCode?: { userCode: string; verificationUri: string; expiresInSeconds?: number }
  progress?: string
  error?: string
}

interface ProviderCard {
  id: ProviderId
  name: OAuthSettingsKey
  description: OAuthSettingsKey
  add: OAuthSettingsKey
  route: string
  endpoint: string
  credentialRef: string
  proxyRef: string
}

interface SettingsInjected {
  describe: () => Promise<Record<ProviderId, ProviderStatus>>
  start: (provider: ProviderCard) => Promise<FlowState>
  flow: (provider: ProviderCard, flowId: string) => Promise<FlowState>
  respond: (provider: ProviderCard, flowId: string, promptId: string, value: string) => Promise<FlowState>
  cancel: (provider: ProviderCard, flowId: string) => Promise<FlowState>
  logout: (provider: ProviderCard) => Promise<ProviderStatus>
  configureProxy: (provider: ProviderCard, value: string | null, scope: 'provider' | 'shared') => Promise<ProviderStatus>
  promoteProxy: (provider: ProviderCard) => Promise<ProviderStatus>
  refreshSession: (provider: ProviderCard) => Promise<ProviderStatus>
  selectAccount: (provider: ProviderCard, accountId: string) => Promise<ProviderStatus>
  configureResetCredit: (provider: ProviderCard, accountId: string, enabled: boolean) => Promise<ProviderStatus>
  configureUsage: (provider: ProviderCard, accountId: string, usedPercent: number, resetsAt?: number) => Promise<ProviderStatus>
  subscribe: (listener: () => void) => () => void
}

type SettingsProps = PropsRuntime<'settings.section'>
  & PropsLocale<'settings.oauthProviders'>
  & InjectFace<SettingsInjected>

const apiRoot = '/plugins/dsh-oauth-model-providers/oauth'
const providers: readonly ProviderCard[] = [
  {
    id: 'codex', name: 'codexName', description: 'codexDescription', add: 'addCodex',
    route: 'openai-codex-oauth', endpoint: `${apiRoot}/openai-codex-oauth`,
    credentialRef: 'DSH_OPENAI_CODEX_OAUTH', proxyRef: 'DSH_OPENAI_CODEX_PROXY',
  },
  {
    id: 'claude', name: 'claudeName', description: 'claudeDescription', add: 'addClaude',
    route: 'anthropic-oauth', endpoint: `${apiRoot}/anthropic-oauth`,
    credentialRef: 'DSH_ANTHROPIC_OAUTH', proxyRef: 'DSH_ANTHROPIC_PROXY',
  },
]

const LANGUAGE_KEY = 'dsh-oauth-model-providers:language:v1'
const page: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760, color: 'var(--dsw-alias-label-primary)' }
const titleRow: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }
const heading: CSSProperties = { margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 500 }
const intro: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-tertiary)' }
const languageGroup: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: 3, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 9 }
const languageButton = (active: boolean): CSSProperties => ({ border: 0, borderRadius: 6, padding: '5px 9px', cursor: 'pointer', fontSize: 12, color: 'var(--dsw-alias-label-primary)', background: active ? 'var(--dsw-alias-bg-module-platform)' : 'transparent' })
const cards: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }
const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, padding: '15px 16px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12 }
const cardHead: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 12 }
const identity: CSSProperties = { display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column', gap: 3 }
const nameStyle: CSSProperties = { fontSize: 14, lineHeight: '22px', fontWeight: 500 }
const detail: CSSProperties = { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }
const statusStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, lineHeight: '18px' }
const footer: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }
const routeStyle: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 11, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }
const securityStyle: CSSProperties = { margin: '4px 0 0', padding: '10px 12px', borderRadius: 10, background: 'var(--dsw-alias-bg-module-platform)', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' }
const panel: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 10, background: 'var(--dsw-alias-bg-module-platform)' }
const proxyGrid: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 10, borderTop: '1px solid var(--dsw-alias-border-l2)' }
const inputRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const inputStyle: CSSProperties = { flex: '1 1 320px', minWidth: 180, height: 32, boxSizing: 'border-box', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '0 10px', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-base)', outline: 'none' }
const errorStyle: CSSProperties = { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' }
const successStyle: CSSProperties = { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-success-primary)' }
const codeStyle: CSSProperties = { display: 'inline-block', padding: '7px 10px', borderRadius: 8, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 16, letterSpacing: 2, background: 'var(--dsw-alias-bg-base)' }
const actionRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const accountList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: 'var(--dsw-alias-bg-module-platform)' }
const accountRow: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }

function usageCircle(percent: number): CSSProperties {
  const safe = Math.max(0, Math.min(100, percent))
  return {
    width: 24, height: 24, borderRadius: '50%', flex: '0 0 24px',
    background: `conic-gradient(var(--dsw-alias-state-success-primary) ${safe}%, var(--dsw-alias-border-l2) 0)`,
    mask: 'radial-gradient(circle at center, transparent 52%, black 54%)',
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function loadLanguage(): Language {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY) === 'zh-TW' ? 'zh-TW' : 'en'
  } catch {
    return 'en'
  }
}

function saveLanguage(language: Language): void {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, language)
  } catch {}
}

function format(copy: typeof en, key: OAuthSettingsKey, params?: Record<string, string>): string {
  const value = copy[key]
  if (params === undefined) return value
  return value.replace(/\{(\w+)\}/gu, (match, name: string) => params[name] ?? match)
}

function isTerminal(phase: Phase): boolean {
  return phase === 'complete' || phase === 'error' || phase === 'cancelled'
}

interface FlowPanelProps {
  flow: FlowState
  copy: typeof en
  manualValue: string
  setManualValue: (value: string) => void
  answer: (promptId: string, value: string) => void
  cancel: () => void
}

function FlowPanel({ flow, copy, manualValue, setManualValue, answer, cancel }: FlowPanelProps): ReactNode {
  const prompt = flow.prompt
  return (
    <div style={panel} data-oauth-flow={flow.phase} aria-live="polite">
      {prompt?.type === 'select'
        ? (
            <>
              <span style={nameStyle}>{format(copy, 'chooseMethod')}</span>
              <p style={detail}>{prompt.message}</p>
              <div style={actionRow}>
                {prompt.options?.map(option => (
                  <Button key={option.id} variant="outline" size="sm" onClick={() => { answer(prompt.id, option.id) }}>
                    {option.label}
                  </Button>
                ))}
              </div>
            </>
          )
        : null}
      {flow.authUrl === undefined
        ? null
        : (
            <>
              <div style={actionRow}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => { window.open(flow.authUrl, '_blank', 'noopener,noreferrer') }}
                >
                  {format(copy, 'openSignIn')}
                </Button>
              </div>
              <p style={detail}>{format(copy, 'autoCallback')}</p>
            </>
          )}
      {flow.deviceCode === undefined
        ? null
        : (
            <>
              <span style={nameStyle}>{format(copy, 'deviceCode')}</span>
              <span style={codeStyle}>{flow.deviceCode.userCode}</span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => { window.open(flow.deviceCode?.verificationUri, '_blank', 'noopener,noreferrer') }}
              >
                {format(copy, 'openVerification')}
              </Button>
            </>
          )}
      {prompt !== undefined && prompt.type !== 'select'
        ? (
            <>
              <p style={detail}>{flow.authUrl === undefined ? prompt.message : format(copy, 'manualFallback')}</p>
              <div style={inputRow}>
                <input
                  aria-label={prompt.message}
                  style={inputStyle}
                  type={prompt.type === 'secret' ? 'password' : 'text'}
                  value={manualValue}
                  placeholder={prompt.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => { setManualValue(event.currentTarget.value) }}
                />
                <Button variant="outline" size="sm" disabled={manualValue.trim().length === 0} onClick={() => { answer(prompt.id, manualValue) }}>
                  {format(copy, 'submitCode')}
                </Button>
              </div>
            </>
          )
        : null}
      {flow.phase === 'complete' ? <p style={successStyle}>{format(copy, 'completed')}</p> : null}
      {flow.phase === 'cancelled' ? <p style={detail}>{format(copy, 'cancelled')}</p> : null}
      {flow.phase === 'error' ? <p role="alert" style={errorStyle}>{flow.error ?? format(copy, 'failed')}</p> : null}
      {!isTerminal(flow.phase) && prompt?.type !== 'select'
        ? <p style={detail}>{flow.progress ?? format(copy, 'waiting')}</p>
        : null}
      {!isTerminal(flow.phase)
        ? <div><Button variant="outline" size="sm" onClick={cancel}>{format(copy, 'cancel')}</Button></div>
        : null}
    </div>
  )
}

function OAuthSettingsSection(props: SettingsProps): ReactNode {
  const candidate = props as Partial<SettingsInjected>
  if (typeof candidate.describe !== 'function'
    || typeof candidate.start !== 'function'
    || typeof candidate.flow !== 'function'
    || typeof candidate.respond !== 'function'
    || typeof candidate.cancel !== 'function'
    || typeof candidate.logout !== 'function'
    || typeof candidate.configureProxy !== 'function'
    || typeof candidate.promoteProxy !== 'function'
    || typeof candidate.refreshSession !== 'function'
    || typeof candidate.selectAccount !== 'function'
    || typeof candidate.configureResetCredit !== 'function'
    || typeof candidate.configureUsage !== 'function'
    || typeof candidate.subscribe !== 'function') {
    return (
      <section style={page} aria-busy="true" aria-live="polite">
        <p style={intro}>Loading OAuth providers… / 正在載入 OAuth 提供者…</p>
      </section>
    )
  }
  return <LoadedOAuthSettingsSection {...props} />
}

function LoadedOAuthSettingsSection(props: SettingsProps): ReactNode {
  const {
    describe, start, flow, respond, cancel, logout, configureProxy, promoteProxy,
    refreshSession, selectAccount, configureResetCredit, subscribe,
    configureUsage,
  } = props
  const [language, setLanguage] = useState<Language>(loadLanguage)
  const copy = language === 'zh-TW' ? zh : en
  const [statuses, setStatuses] = useState<Record<ProviderId, ProviderStatus>>()
  const [loadError, setLoadError] = useState<string>()
  const [busy, setBusy] = useState<ProviderId>()
  const [active, setActive] = useState<Partial<Record<ProviderId, FlowState>>>({})
  const [manualValues, setManualValues] = useState<Record<ProviderId, string>>({ codex: '', claude: '' })
  const [proxyValues, setProxyValues] = useState<Record<ProviderId, string>>({ codex: '', claude: '' })
  const [proxyScope, setProxyScope] = useState<ProxyScope>('shared')
  const [notice, setNotice] = useState<{ provider: ProviderId; error?: string; message?: OAuthSettingsKey }>()
  const loadGeneration = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const generation = ++loadGeneration.current
    try {
      const next = await describe()
      if (generation !== loadGeneration.current) return
      setStatuses(next)
      setLoadError(undefined)
    } catch (error) {
      if (generation !== loadGeneration.current) return
      setLoadError(messageOf(error))
    }
  }, [describe])

  useEffect(() => {
    void load()
    const dispose = subscribe(() => { void load() })
    return () => {
      loadGeneration.current += 1
      dispose()
    }
  }, [load, subscribe])

  useEffect(() => {
    const pending = providers.flatMap(provider => {
      const state = active[provider.id]
      return state === undefined || isTerminal(state.phase) ? [] : [{ provider, state }]
    })
    if (pending.length === 0) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      try {
        const results = await Promise.all(pending.map(async ({ provider, state }) => ({
          provider,
          state: await flow(provider, state.id),
        })))
        if (!live) return
        setActive(current => ({ ...current, ...Object.fromEntries(results.map(result => [result.provider.id, result.state])) }))
        if (results.some(result => result.state.phase === 'complete')) await load()
        if (results.some(result => !isTerminal(result.state.phase))) timer = setTimeout(() => { void poll() }, 650)
      } catch (error) {
        if (!live) return
        setNotice({ provider: pending[0]!.provider.id, error: messageOf(error) })
        timer = setTimeout(() => { void poll() }, 1000)
      }
    }
    timer = setTimeout(() => { void poll() }, 350)
    return () => {
      live = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [active.codex?.id, active.codex?.revision, active.claude?.id, active.claude?.revision, flow, load])

  const switchLanguage = (next: Language): void => {
    setLanguage(next)
    saveLanguage(next)
  }

  const begin = async (provider: ProviderCard): Promise<void> => {
    setBusy(provider.id)
    setNotice(undefined)
    setManualValues(current => ({ ...current, [provider.id]: '' }))
    try {
      const state = await start(provider)
      setActive(current => ({ ...current, [provider.id]: state }))
    } catch (error) {
      setNotice({ provider: provider.id, error: messageOf(error) })
    } finally {
      setBusy(undefined)
    }
  }

  const answer = async (provider: ProviderCard, promptId: string, value: string): Promise<void> => {
    const providerFlow = active[provider.id]
    if (providerFlow === undefined) return
    setNotice(undefined)
    try {
      setManualValues(current => ({ ...current, [provider.id]: '' }))
      const state = await respond(provider, providerFlow.id, promptId, value)
      setActive(current => ({ ...current, [provider.id]: state }))
    } catch (error) {
      setNotice({ provider: provider.id, error: messageOf(error) })
    }
  }

  const stop = async (provider: ProviderCard): Promise<void> => {
    const providerFlow = active[provider.id]
    if (providerFlow === undefined) return
    try {
      const state = await cancel(provider, providerFlow.id)
      setActive(current => ({ ...current, [provider.id]: state }))
    } catch (error) {
      setNotice({ provider: provider.id, error: messageOf(error) })
    }
  }

  const disconnect = async (provider: ProviderCard): Promise<void> => {
    setBusy(provider.id)
    setNotice(undefined)
    try {
      const status = await logout(provider)
      setStatuses(current => current === undefined ? current : { ...current, [provider.id]: status })
      setActive(current => ({ ...current, [provider.id]: undefined }))
    } catch (error) {
      setNotice({ provider: provider.id, error: messageOf(error) })
    } finally {
      setBusy(undefined)
    }
  }

  const saveProxy = async (provider: ProviderCard, value: string | null, scope: 'provider' | 'shared' = 'provider'): Promise<void> => {
    setBusy(provider.id)
    setNotice(undefined)
    try {
      const status = await configureProxy(provider, value, scope)
      setStatuses(current => current === undefined ? current : { ...current, [provider.id]: status })
      setProxyValues(current => ({ ...current, [provider.id]: '' }))
      setNotice({ provider: provider.id, message: value === null ? 'proxyRemoved' : 'proxySaved' })
    } catch (error) {
      setNotice({ provider: provider.id, error: messageOf(error) })
    } finally {
      setBusy(undefined)
    }
  }

  const updateProvider = async (
    provider: ProviderCard,
    operation: () => Promise<ProviderStatus>,
  ): Promise<void> => {
    setBusy(provider.id)
    setNotice(undefined)
    try {
      const status = await operation()
      setStatuses(current => current === undefined ? current : { ...current, [provider.id]: status })
      await load()
    } catch (error) {
      setNotice({ provider: provider.id, error: messageOf(error) })
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section style={page} aria-labelledby="oauth-provider-settings-title">
      <div style={titleRow}>
        <h2 id="oauth-provider-settings-title" style={heading}>{format(copy, 'title')}</h2>
        <div style={languageGroup} aria-label={format(copy, 'language')}>
          <button type="button" style={languageButton(language === 'en')} aria-pressed={language === 'en'} onClick={() => { switchLanguage('en') }}>{format(copy, 'english')}</button>
          <button type="button" style={languageButton(language === 'zh-TW')} aria-pressed={language === 'zh-TW'} onClick={() => { switchLanguage('zh-TW') }}>{format(copy, 'traditionalChinese')}</button>
        </div>
      </div>
      <p style={intro}>{format(copy, 'intro')}</p>
      <div style={cards}>
        {providers.map((provider) => {
          const providerStatus = statuses?.[provider.id]
          const connected = providerStatus?.connected
          const loading = statuses === undefined && loadError === undefined
          const status = loadError !== undefined ? 'error' : connected === true ? 'done' : 'warning'
          const statusText = loading ? format(copy, 'checking') : loadError !== undefined ? format(copy, 'unavailable') : connected === true ? format(copy, 'connected') : format(copy, 'disconnected')
          const isBusy = busy === provider.id
          const providerFlow = active[provider.id]
          const proxyValue = proxyValues[provider.id]
          const proxyTarget = providers.find(candidate => candidate.id === (proxyScope === 'shared' ? provider.id : proxyScope)) ?? provider
          const selectedProxyStatus = statuses?.[proxyTarget.id]
          const providerNotice = notice?.provider === provider.id ? notice : undefined
          return (
            <article key={provider.id} style={card} data-oauth-provider={provider.id}>
              <div style={cardHead}>
                <div style={identity}>
                  <span style={nameStyle}>{format(copy, provider.name)}</span>
                  <p style={detail}>{format(copy, provider.description)}</p>
                </div>
                <span style={statusStyle} aria-label={statusText}>
                  {loading
                    ? <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--dsw-alias-label-tertiary)' }} />
                    : <StateDot state={status} />}
                  {statusText}
                </span>
              </div>
              <div style={footer}>
                <span style={routeStyle}>{provider.route}</span>
                {loadError !== undefined
                  ? <Button variant="outline" size="sm" onClick={() => { void load() }}>{format(copy, 'retry')}</Button>
                  : connected === true
                    ? <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => { void disconnect(provider) }}>{isBusy ? format(copy, 'starting') : format(copy, 'disconnect')}</Button>
                    : <Button variant="primary" size="sm" disabled={loading || busy !== undefined || (providerFlow !== undefined && !isTerminal(providerFlow.phase))} onClick={() => { void begin(provider) }}>{isBusy ? format(copy, 'starting') : format(copy, provider.add)}</Button>}
              </div>
              <p style={detail}>{connected === true ? format(copy, 'routeReady') : format(copy, 'routeHidden')}</p>
              {provider.id === 'codex'
                ? (
                    <div style={proxyGrid} data-codex-workflow-features>
                      <span style={nameStyle}>{format(copy, 'codexFeatures')}</span>
                      <p style={detail}>{format(copy, 'remoteCompaction')}</p>
                      <p style={detail}>{format(copy, 'codeReviewHelp')}</p>
                      <p style={detail}>{format(copy, 'toolCallingHelp')}</p>
                    </div>
                  )
                : null}
              {providerStatus?.accounts.length
                ? (
                    <div style={accountList}>
                      <div style={accountRow}>
                        <span style={nameStyle}>{format(copy, 'accounts')}</span>
                        <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => { void updateProvider(provider, () => refreshSession(provider)) }}>{format(copy, 'refreshUsage')}</Button>
                      </div>
                      {providerStatus.accounts.map((account) => {
                        const used = Math.round(account.usage.usedPercent ?? 0)
                        const remaining = Math.round(account.usage.remainingPercent ?? Math.max(0, 100 - used))
                        const reset = account.usage.resetsAt === undefined
                          ? 'unknown'
                          : new Date(account.usage.resetsAt * 1000).toLocaleString(language)
                        const usageTitle = account.usage.source === 'unavailable'
                          ? format(copy, 'usageUnavailable')
                          : format(copy, 'usageDetails', { used: String(used), remaining: String(remaining), reset })
                        return (
                          <div key={account.id} style={accountRow} data-oauth-account={account.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }} title={usageTitle}>
                              <span style={usageCircle(used)} aria-label={`${used}%`} />
                              <span style={detail}>{used}%</span>
                              <span style={nameStyle}>{account.label}</span>
                              {account.active ? <span style={successStyle}>{format(copy, 'activeAccount')}</span> : null}
                            </div>
                            <div style={actionRow}>
                              {account.usage.resetCredits === undefined ? null : <span style={detail}>{format(copy, 'resetCredits', { count: String(account.usage.resetCredits) })}</span>}
                              {!account.active
                                ? <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => { void updateProvider(provider, () => selectAccount(provider, account.id)) }}>{format(copy, 'useAccount')}</Button>
                                : null}
                              {provider.id === 'codex'
                                ? (
                                    <label style={detail}>
                                      <input type="checkbox" checked={account.useResetCredit} onChange={(event) => { void updateProvider(provider, () => configureResetCredit(provider, account.id, event.currentTarget.checked)) }} />{' '}
                                      {format(copy, 'useResetCredit')}
                                    </label>
                                  )
                                : null}
                              {provider.id === 'claude'
                                ? (
                                    <form style={actionRow} onSubmit={(event) => {
                                      event.preventDefault()
                                      const data = new FormData(event.currentTarget)
                                      const usedPercent = Number(data.get('usedPercent'))
                                      const resetValue = String(data.get('resetsAt') ?? '')
                                      const resetsAt = resetValue.length === 0 ? undefined : Math.floor(new Date(resetValue).getTime() / 1000)
                                      void updateProvider(provider, () => configureUsage(provider, account.id, usedPercent, resetsAt))
                                    }}>
                                      <span style={detail}>{format(copy, 'claudeUsageHelp')}</span>
                                      <input style={{ ...inputStyle, flex: '0 0 84px', minWidth: 84 }} name="usedPercent" type="number" min="0" max="100" defaultValue={account.configuredUsage?.usedPercent ?? 0} aria-label="Claude used percent" />
                                      <input style={{ ...inputStyle, flex: '0 0 190px', minWidth: 190 }} name="resetsAt" type="datetime-local" defaultValue={account.configuredUsage?.resetsAt === undefined ? '' : new Date(account.configuredUsage.resetsAt * 1000).toISOString().slice(0, 16)} aria-label="Claude reset time" />
                                      <Button variant="outline" size="sm" type="submit" disabled={busy !== undefined}>{format(copy, 'saveClaudeUsage')}</Button>
                                    </form>
                                  )
                                : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                : null}
              <div style={actionRow}>
                <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => { void updateProvider(provider, () => refreshSession(provider)) }}>{format(copy, 'refreshSession')}</Button>
              </div>
              {providerFlow === undefined
                ? null
                : (
                    <FlowPanel
                      flow={providerFlow}
                      copy={copy}
                      manualValue={manualValues[provider.id]}
                      setManualValue={(value) => { setManualValues(current => ({ ...current, [provider.id]: value })) }}
                      answer={(promptId, value) => { void answer(provider, promptId, value) }}
                      cancel={() => { void stop(provider) }}
                    />
                  )}
              <div style={proxyGrid}>
                <span style={nameStyle}>{format(copy, 'proxyTitle')}</span>
                <p style={detail}>{format(copy, 'proxyHelp')}</p>
                <p style={detail}>{format(copy, 'proxyBrowserNote')}</p>
                <p style={detail}>
                  {providerStatus?.proxy.configured === true
                    ? `${format(copy, 'proxyConfigured', { proxy: providerStatus.proxy.display ?? 'HTTP(S)' })} · ${format(copy, providerStatus.proxy.source === 'shared' ? 'sharedProxySource' : 'providerProxySource')}`
                    : format(copy, 'proxyNotConfigured')}
                </p>
                <label style={detail}>
                  {format(copy, 'proxyScope')}{' '}
                  <select value={proxyScope} onChange={(event) => { setProxyScope(event.currentTarget.value as ProxyScope) }}>
                    <option value="shared">{format(copy, 'sharedProxy')}</option>
                    <option value="codex">{format(copy, 'codexProxy')}</option>
                    <option value="claude">{format(copy, 'claudeProxy')}</option>
                  </select>
                </label>
                <div style={inputRow}>
                  <input
                    aria-label={`${format(copy, provider.name)} ${format(copy, 'proxyTitle')}`}
                    style={inputStyle}
                    type="password"
                    value={proxyValue}
                    placeholder={format(copy, 'proxyPlaceholder')}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      setProxyValues(current => ({ ...current, [provider.id]: value }))
                    }}
                  />
                  <Button variant="outline" size="sm" disabled={busy !== undefined || proxyValue.trim().length === 0} onClick={() => { void saveProxy(proxyTarget, proxyValue, proxyScope === 'shared' ? 'shared' : 'provider') }}>
                    {isBusy ? format(copy, 'savingProxy') : format(copy, selectedProxyStatus?.proxy.configured === true ? 'replaceProxy' : 'saveProxy')}
                  </Button>
                  {(proxyScope === 'shared' ? selectedProxyStatus?.proxy.sharedConfigured : selectedProxyStatus?.proxy.providerConfigured) === true
                    ? <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => { void saveProxy(proxyTarget, null, proxyScope === 'shared' ? 'shared' : 'provider') }}>{format(copy, 'removeProxy')}</Button>
                    : null}
                  {providerStatus?.proxy.providerConfigured === true && providerStatus.proxy.sharedConfigured !== true
                    ? <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => { void updateProvider(provider, () => promoteProxy(provider)) }}>{format(copy, 'reuseForBoth')}</Button>
                    : null}
                </div>
              </div>
              {providerNotice?.error === undefined ? null : <p role="alert" style={errorStyle}>{format(copy, 'failed')}: {providerNotice.error}</p>}
              {providerNotice?.message === undefined ? null : <p role="status" style={successStyle}>{format(copy, providerNotice.message)}</p>}
            </article>
          )
        })}
      </div>
      <p style={securityStyle}>{format(copy, 'security')}</p>
    </section>
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.oauthProviders': OAuthSettingsKey
  }
}

const NS = 'settings.oauthProviders'

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const value = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`)
  return value
}

function postJson<T>(provider: ProviderCard, action: string, body: Record<string, unknown>): Promise<T> {
  return requestJson<T>(`${provider.endpoint}${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

interface ReviewRunResult {
  started: boolean
  error: string | null
}

interface ReviewButtonInjected {
  runReview(mode: 'manual' | 'auto'): Promise<ReviewRunResult>
}

type ReviewButtonProps = PropsRuntime<'conversation.input.left'>
  & PropsLocale<typeof NS>
  & InjectFace<ReviewButtonInjected>

const AUTO_REVIEW_STORAGE_KEY = 'dsh.oauthModelProviders.autoCodeReview'

function latestCompletion(session: ReviewButtonProps['session']): { turn: number; seq: number } | undefined {
  let latest: { turn: number; seq: number } | undefined
  for (const [turn, seq] of session.turnEnds) {
    if (latest === undefined || seq > latest.seq) latest = { turn, seq }
  }
  return latest
}

function completedTurnProvider(
  session: ReviewButtonProps['session'],
  turn: number,
): string | undefined {
  for (let index = session.nodes.length - 1; index >= 0; index--) {
    const node = session.nodes[index]
    if (node?.kind === 'assistant' && node.messageId !== undefined && node.turn === turn) {
      return node.provenance?.provider
    }
  }
  return undefined
}

function ReviewButton({ input, session, runReview, t }: ReviewButtonProps): ReactNode {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoReview, setAutoReview] = useState(() => {
    try { return localStorage.getItem(AUTO_REVIEW_STORAGE_KEY) !== 'false' } catch { return true }
  })
  const mounted = useRef(true)
  const processedTurnEnd = useRef(latestCompletion(session)?.seq)
  const skipNextCompletion = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(AUTO_REVIEW_STORAGE_KEY, String(autoReview)) } catch { /* storage may be disabled */ }
  }, [autoReview])

  const start = useCallback((mode: 'manual' | 'auto'): void => {
    setRunning(true)
    setError(null)
    void runReview(mode).then((result) => {
      if (!mounted.current) return
      setRunning(false)
      if (result.started) skipNextCompletion.current = true
      setError(result.error)
    }, (reason: unknown) => {
      if (!mounted.current) return
      setRunning(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }, [runReview])

  useEffect(() => {
    if (session.running) return
    const completed = latestCompletion(session)
    if (completed === undefined || completed.seq === processedTurnEnd.current) return
    processedTurnEnd.current = completed.seq
    if (skipNextCompletion.current) {
      skipNextCompletion.current = false
      return
    }
    if (autoReview && completedTurnProvider(session, completed.turn) === 'openai-codex-oauth') start('auto')
  }, [autoReview, session, start])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Button
        variant="outline"
        size="sm"
        disabled={running || input.phase === 'submitting'}
        title={t('codeReviewTitle')}
        aria-label={t('codeReviewTitle')}
        onClick={() => { start('manual') }}
      >
        {t('codeReview')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={autoReview}
        title={t('autoCodeReviewTitle')}
        aria-label={t('autoCodeReviewTitle')}
        onClick={() => { setAutoReview(value => !value) }}
      >
        {t(autoReview ? 'autoCodeReviewOn' : 'autoCodeReviewOff')}
      </Button>
      {error === null
        ? null
        : <span role="status" title={error} style={errorStyle}>{t('codeReviewFailed')}</span>}
    </span>
  )
}

export const inject = ['slots', 'locale', 'remote']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'oauth-model-providers: Settings dictionaries')
  ctx.effect(() => {
    type MutableLocale = {
      dicts: Map<string, Map<string, Record<string, string>>>
      getLocale(): { active: string }
      publish(active: string, durable: boolean): void
    }
    const runtime = ctx.locale as unknown as MutableLocale
    const model = runtime.dicts.get('model')
    const english = model?.get('en')
    const chinese = model?.get('zh')
    if (english === undefined || chinese === undefined) return () => undefined
    const oldEnglish = english['effort.providerDefault']
    const oldChinese = chinese['effort.providerDefault']
    english['effort.providerDefault'] = 'Default (model default effort)'
    chinese['effort.providerDefault'] = '預設（模型預設推理等級）'
    runtime.publish(runtime.getLocale().active, false)
    return () => {
      if (oldEnglish === undefined) delete english['effort.providerDefault']
      else english['effort.providerDefault'] = oldEnglish
      if (oldChinese === undefined) delete chinese['effort.providerDefault']
      else chinese['effort.providerDefault'] = oldChinese
      runtime.publish(runtime.getLocale().active, false)
    }
  }, 'oauth-model-providers: clarify provider-default reasoning effort')

  const describe = async (): Promise<Record<ProviderId, ProviderStatus>> => {
    const statuses = await Promise.all(providers.map(provider =>
      requestJson<ProviderStatus>(`${provider.endpoint}/status`)))
    return { codex: statuses[0]!, claude: statuses[1]! }
  }

  const injected = (): SettingsInjected => ({
    describe,
    start: provider => postJson(provider, '/start', {}),
    flow: (provider, flowId) => requestJson(`${provider.endpoint}/state?flowId=${encodeURIComponent(flowId)}`),
    respond: (provider, flowId, promptId, value) => postJson(provider, '/respond', { flowId, promptId, value }),
    cancel: (provider, flowId) => postJson(provider, '/cancel', { flowId }),
    logout: provider => postJson(provider, '/logout', {}),
    configureProxy: (provider, value, scope) => postJson(provider, '/proxy', { value, scope }),
    promoteProxy: provider => postJson(provider, '/proxy/promote', {}),
    refreshSession: provider => postJson(provider, '/refresh', {}),
    selectAccount: (provider, accountId) => postJson(provider, '/account/select', { accountId }),
    configureResetCredit: (provider, accountId, enabled) => postJson(provider, '/account/reset-credit', { accountId, enabled }),
    configureUsage: (provider, accountId, usedPercent, resetsAt) => postJson(provider, '/account/usage-config', { accountId, usedPercent, ...(resetsAt === undefined ? {} : { resetsAt }) }),
    subscribe: (listener) => {
      const refs = new Set([...providers.flatMap(provider => [provider.credentialRef, provider.proxyRef]), 'DSH_OAUTH_SHARED_PROXY'])
      const stopCredential = ctx.remote.$on('credentials/updated', (ref) => {
        if (refs.has(ref)) listener()
      })
      const stopConnection = ctx.on('connection/reset', listener)
      return () => { stopCredential(); stopConnection() }
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'oauth-providers',
    order: 15,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    inject: injected,
  }, OAuthSettingsSection))

  ctx.inject(['remote.commands'], (reviewCtx) => {
    reviewCtx.slots.inject('conversation.input.left', () => reviewCtx.slots.register({
      name: 'conversation.input.left',
      id: 'codex-code-review',
      order: 35,
      label: () => reviewCtx.locale.bind(NS)('codeReview'),
      locale: NS,
      inject: (sessionId) => ({
        runReview: async (mode: 'manual' | 'auto'): Promise<ReviewRunResult> => {
          const result = await reviewCtx.remote.commands.execute(
            sessionId,
            mode === 'auto' ? '/review auto' : '/review',
          )
          if (!result.ok) return { started: false, error: `${result.error.message} (${result.error.code})` }
          if (result.value === undefined) return { started: false, error: 'Unknown command: /review' }
          if (result.value.result.kind === 'error') {
            return { started: false, error: result.value.result.text ?? 'Code review failed' }
          }
          return {
            started: result.value.result.text?.startsWith('Code review started') === true,
            error: null,
          }
        },
      }),
    }, ReviewButton))
  })
}
