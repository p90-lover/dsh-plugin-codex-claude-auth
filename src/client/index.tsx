import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

const en = {
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

const zh: { [Key in keyof typeof en]: string } = {
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

type OAuthSettingsKey = keyof typeof en
type ProviderId = 'codex' | 'claude'
type Language = 'en' | 'zh-TW'
type Phase = 'starting' | 'input' | 'authorizing' | 'device_code' | 'complete' | 'error' | 'cancelled'

interface ProviderStatus {
  connected: boolean
  proxy: { configured: boolean; display?: string }
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

interface ActiveFlow {
  provider: ProviderId
  state: FlowState
}

interface SettingsInjected {
  describe: () => Promise<Record<ProviderId, ProviderStatus>>
  start: (provider: ProviderCard) => Promise<FlowState>
  flow: (provider: ProviderCard, flowId: string) => Promise<FlowState>
  respond: (provider: ProviderCard, flowId: string, promptId: string, value: string) => Promise<FlowState>
  cancel: (provider: ProviderCard, flowId: string) => Promise<FlowState>
  logout: (provider: ProviderCard) => Promise<ProviderStatus>
  configureProxy: (provider: ProviderCard, value: string | null) => Promise<ProviderStatus>
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
  const { describe, start, flow, respond, cancel, logout, configureProxy, subscribe } = props
  const [language, setLanguage] = useState<Language>(loadLanguage)
  const copy = language === 'zh-TW' ? zh : en
  const [statuses, setStatuses] = useState<Record<ProviderId, ProviderStatus>>()
  const [loadError, setLoadError] = useState<string>()
  const [busy, setBusy] = useState<ProviderId>()
  const [active, setActive] = useState<ActiveFlow>()
  const [manualValue, setManualValue] = useState('')
  const [proxyValues, setProxyValues] = useState<Record<ProviderId, string>>({ codex: '', claude: '' })
  const [notice, setNotice] = useState<{ provider: ProviderId; error?: string; message?: OAuthSettingsKey }>()

  const load = useCallback(async (): Promise<void> => {
    try {
      setStatuses(await describe())
      setLoadError(undefined)
    } catch (error) {
      setLoadError(messageOf(error))
    }
  }, [describe])

  useEffect(() => {
    void load()
    return subscribe(() => { void load() })
  }, [load, subscribe])

  useEffect(() => {
    const provider = providers.find(candidate => candidate.id === active?.provider)
    if (active === undefined || provider === undefined || isTerminal(active.state.phase)) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      try {
        const state = await flow(provider, active.state.id)
        if (!live) return
        setActive({ provider: provider.id, state })
        if (state.phase === 'complete') await load()
        if (!isTerminal(state.phase)) timer = setTimeout(() => { void poll() }, 650)
      } catch (error) {
        if (!live) return
        setNotice({ provider: provider.id, error: messageOf(error) })
        timer = setTimeout(() => { void poll() }, 1000)
      }
    }
    timer = setTimeout(() => { void poll() }, 350)
    return () => {
      live = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [active?.provider, active?.state.id, flow, load])

  const switchLanguage = (next: Language): void => {
    setLanguage(next)
    saveLanguage(next)
  }

  const begin = async (provider: ProviderCard): Promise<void> => {
    setBusy(provider.id)
    setNotice(undefined)
    setManualValue('')
    try {
      setActive({ provider: provider.id, state: await start(provider) })
    } catch (error) {
      setNotice({ provider: provider.id, error: messageOf(error) })
    } finally {
      setBusy(undefined)
    }
  }

  const answer = async (provider: ProviderCard, promptId: string, value: string): Promise<void> => {
    if (active?.provider !== provider.id) return
    setNotice(undefined)
    try {
      setManualValue('')
      setActive({ provider: provider.id, state: await respond(provider, active.state.id, promptId, value) })
    } catch (error) {
      setNotice({ provider: provider.id, error: messageOf(error) })
    }
  }

  const stop = async (provider: ProviderCard): Promise<void> => {
    if (active?.provider !== provider.id) return
    try {
      setActive({ provider: provider.id, state: await cancel(provider, active.state.id) })
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
      if (active?.provider === provider.id) setActive(undefined)
    } catch (error) {
      setNotice({ provider: provider.id, error: messageOf(error) })
    } finally {
      setBusy(undefined)
    }
  }

  const saveProxy = async (provider: ProviderCard, value: string | null): Promise<void> => {
    setBusy(provider.id)
    setNotice(undefined)
    try {
      const status = await configureProxy(provider, value)
      setStatuses(current => current === undefined ? current : { ...current, [provider.id]: status })
      setProxyValues(current => ({ ...current, [provider.id]: '' }))
      setNotice({ provider: provider.id, message: value === null ? 'proxyRemoved' : 'proxySaved' })
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
          const status = loading ? 'ongoing' : loadError !== undefined ? 'error' : connected === true ? 'done' : 'warning'
          const statusText = loading ? format(copy, 'checking') : loadError !== undefined ? format(copy, 'unavailable') : connected === true ? format(copy, 'connected') : format(copy, 'disconnected')
          const isBusy = busy === provider.id
          const providerFlow = active?.provider === provider.id ? active.state : undefined
          const proxyValue = proxyValues[provider.id]
          const providerNotice = notice?.provider === provider.id ? notice : undefined
          return (
            <article key={provider.id} style={card} data-oauth-provider={provider.id}>
              <div style={cardHead}>
                <div style={identity}>
                  <span style={nameStyle}>{format(copy, provider.name)}</span>
                  <p style={detail}>{format(copy, provider.description)}</p>
                </div>
                <span style={statusStyle} aria-label={statusText}><StateDot state={status} />{statusText}</span>
              </div>
              <div style={footer}>
                <span style={routeStyle}>{provider.route}</span>
                {loadError !== undefined
                  ? <Button variant="outline" size="sm" onClick={() => { void load() }}>{format(copy, 'retry')}</Button>
                  : connected === true
                    ? <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => { void disconnect(provider) }}>{isBusy ? format(copy, 'starting') : format(copy, 'disconnect')}</Button>
                    : <Button variant="primary" size="sm" disabled={loading || busy !== undefined || (active !== undefined && !isTerminal(active.state.phase))} onClick={() => { void begin(provider) }}>{isBusy ? format(copy, 'starting') : format(copy, provider.add)}</Button>}
              </div>
              <p style={detail}>{connected === true ? format(copy, 'routeReady') : format(copy, 'routeHidden')}</p>
              {providerFlow === undefined
                ? null
                : (
                    <FlowPanel
                      flow={providerFlow}
                      copy={copy}
                      manualValue={manualValue}
                      setManualValue={setManualValue}
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
                    ? format(copy, 'proxyConfigured', { proxy: providerStatus.proxy.display ?? 'HTTP(S)' })
                    : format(copy, 'proxyNotConfigured')}
                </p>
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
                  <Button variant="outline" size="sm" disabled={busy !== undefined || proxyValue.trim().length === 0} onClick={() => { void saveProxy(provider, proxyValue) }}>
                    {isBusy ? format(copy, 'savingProxy') : format(copy, providerStatus?.proxy.configured === true ? 'replaceProxy' : 'saveProxy')}
                  </Button>
                  {providerStatus?.proxy.configured === true
                    ? <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => { void saveProxy(provider, null) }}>{format(copy, 'removeProxy')}</Button>
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

export const inject = ['slots', 'locale', 'remote']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'oauth-model-providers: Settings dictionaries')

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
    configureProxy: (provider, value) => postJson(provider, '/proxy', { value }),
    subscribe: (listener) => {
      const refs = new Set(providers.flatMap(provider => [provider.credentialRef, provider.proxyRef]))
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
}
