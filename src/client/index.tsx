import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext, SessionRuntime } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

const en = {
  nav: 'OAuth Providers',
  title: 'Add Codex or Claude OAuth',
  intro: 'Connect a subscription account without pasting an API key. If no chat is open, Harness creates one automatically, then Settings closes and the secure sign-in steps continue there.',
  security: 'OAuth tokens stay in the DeepSeek Harness credential store. This page only reads connected status; it never receives token values.',
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
  routeReady: 'Models are available in the model picker after sign-in succeeds.',
  routeHidden: 'Models stay hidden from the model picker until sign-in succeeds.',
  retry: 'Retry status',
  noSession: 'Harness could not create or open the OAuth setup chat.',
  missingCommand: 'The OAuth command is not available in this profile.',
  failed: 'Could not start OAuth',
}

const zh: { [Key in keyof typeof en]: string } = {
  nav: 'OAuth 提供者',
  title: '新增 Codex 或 Claude OAuth',
  intro: '不需要貼上 API Key，即可連結訂閱帳號。如果尚未開啟聊天，Harness 會自動建立一個；接著設定頁會關閉，安全登入步驟會在該聊天中繼續。',
  security: 'OAuth 權杖只會保存在 DeepSeek Harness 的憑證儲存區。此頁只讀取連線狀態，永遠不會收到權杖內容。',
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
  routeReady: '登入成功後，模型會出現在模型選擇器。',
  routeHidden: '登入成功前，模型不會出現在模型選擇器。',
  retry: '重新檢查狀態',
  noSession: 'Harness 無法建立或開啟 OAuth 設定聊天。',
  missingCommand: '此設定檔沒有提供 OAuth 指令。',
  failed: '無法啟動 OAuth',
}

type OAuthSettingsKey = keyof typeof en
type ProviderId = 'codex' | 'claude'
type ConnectionMap = Record<ProviderId, boolean>

interface SettingsInjected {
  describe: () => Promise<ConnectionMap>
  runCommand: (command: string) => Promise<void>
  subscribe: (listener: () => void) => () => void
}

type SettingsProps = PropsRuntime<'settings.section'>
  & PropsLocale<'settings.oauthProviders'>
  & InjectFace<SettingsInjected>

interface ProviderCard {
  id: ProviderId
  name: OAuthSettingsKey
  description: OAuthSettingsKey
  add: OAuthSettingsKey
  login: string
  logout: string
  route: string
}

const providers: readonly ProviderCard[] = [
  { id: 'codex', name: 'codexName', description: 'codexDescription', add: 'addCodex', login: '/login-openai', logout: '/logout-openai', route: 'openai-codex-oauth' },
  { id: 'claude', name: 'claudeName', description: 'claudeDescription', add: 'addClaude', login: '/login-claude', logout: '/logout-claude', route: 'anthropic-oauth' },
]

const page: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720, color: 'var(--dsw-alias-label-primary)' }
const heading: CSSProperties = { margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 500 }
const intro: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-tertiary)' }
const cards: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }
const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12 }
const cardHead: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 12 }
const identity: CSSProperties = { display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column', gap: 3 }
const nameStyle: CSSProperties = { fontSize: 14, lineHeight: '22px', fontWeight: 500 }
const detail: CSSProperties = { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }
const statusStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, lineHeight: '18px' }
const footer: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }
const routeStyle: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 11, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }
const securityStyle: CSSProperties = { margin: '4px 0 0', padding: '10px 12px', borderRadius: 10, background: 'var(--dsw-alias-bg-module-platform)', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' }
const errorStyle: CSSProperties = { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function OAuthSettingsSection({ t, close, describe, runCommand, subscribe }: SettingsProps): ReactNode {
  const [connections, setConnections] = useState<ConnectionMap>()
  const [loadError, setLoadError] = useState<string>()
  const [busy, setBusy] = useState<ProviderId>()
  const [commandError, setCommandError] = useState<string>()

  const load = useCallback(async (): Promise<void> => {
    try {
      setConnections(await describe())
      setLoadError(undefined)
    } catch (error) {
      setLoadError(messageOf(error))
    }
  }, [describe])

  useEffect(() => {
    void load()
    return subscribe(() => { void load() })
  }, [load, subscribe])

  const start = async (provider: ProviderCard, command: string): Promise<void> => {
    setBusy(provider.id)
    setCommandError(undefined)
    try {
      await runCommand(command)
      close()
    } catch (error) {
      setCommandError(messageOf(error))
      setBusy(undefined)
    }
  }

  return (
    <section style={page} aria-labelledby="oauth-provider-settings-title">
      <h2 id="oauth-provider-settings-title" style={heading}>{t('title')}</h2>
      <p style={intro}>{t('intro')}</p>
      <div style={cards}>
        {providers.map((provider) => {
          const connected = connections?.[provider.id]
          const loading = connections === undefined && loadError === undefined
          const status = loading ? 'ongoing' : loadError !== undefined ? 'error' : connected === true ? 'done' : 'warning'
          const statusText = loading ? t('checking') : loadError !== undefined ? t('unavailable') : connected === true ? t('connected') : t('disconnected')
          const isBusy = busy === provider.id
          return (
            <article key={provider.id} style={card} data-oauth-provider={provider.id}>
              <div style={cardHead}>
                <div style={identity}>
                  <span style={nameStyle}>{t(provider.name)}</span>
                  <p style={detail}>{t(provider.description)}</p>
                </div>
                <span style={statusStyle} aria-label={statusText}><StateDot state={status} />{statusText}</span>
              </div>
              <div style={footer}>
                <span style={routeStyle}>{provider.route}</span>
                {loadError !== undefined
                  ? <Button variant="outline" size="sm" onClick={() => { void load() }}>{t('retry')}</Button>
                  : connected === true
                    ? <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => { void start(provider, provider.logout) }}>{isBusy ? t('starting') : t('disconnect')}</Button>
                    : <Button variant="primary" size="sm" disabled={loading || busy !== undefined} onClick={() => { void start(provider, provider.login) }}>{isBusy ? t('starting') : t(provider.add)}</Button>}
              </div>
              <p style={detail}>{connected === true ? t('routeReady') : t('routeHidden')}</p>
            </article>
          )
        })}
      </div>
      {commandError === undefined ? null : <p role="alert" style={errorStyle}>{t('failed')}: {commandError}</p>}
      <p style={securityStyle}>{t('security')}</p>
    </section>
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.oauthProviders': OAuthSettingsKey
  }
}

const NS = 'settings.oauthProviders'
const refs = { codex: 'DSH_OPENAI_CODEX_OAUTH', claude: 'DSH_ANTHROPIC_OAUTH' } as const

export const inject = ['slots', 'locale', 'connection', 'remote', 'sessions']

export function apply(ctx: ClientContext): void {
  const { api } = ctx.get('connection') as ConnectionHandle
  // This dual-face package also imports Host session types, so the merged
  // Cordis Context sees both services. The client inject contract guarantees
  // that this lookup is the browser SessionRuntime in this bundle.
  const sessions = ctx.get('sessions') as unknown as SessionRuntime
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'oauth-model-providers: Settings dictionaries')

  const describe = async (): Promise<ConnectionMap> => {
    const response = await api.credentials.describe({ refs: Object.values(refs) })
    if (!response.result.ok) throw new Error(response.result.error.message)
    return {
      codex: response.result.value.credentials[refs.codex]?.configured === true,
      claude: response.result.value.credentials[refs.claude]?.configured === true,
    }
  }

  const runCommand = async (command: string): Promise<void> => {
    let current = sessions.list.getSnapshot().current
    if (current === undefined) {
      current = await sessions.create()
      sessions.open(current)
    }
    const session = sessions.binding(current)?.session
    if (session === undefined) throw new Error(ctx.locale.bind(NS)('noSession'))
    void session.command(command).then((result) => {
      if (!result.ok) {
        ctx.logger.warn(`oauth-model-providers: ${command} failed: ${result.error.message}`)
      } else if (!result.value.matched) {
        ctx.logger.warn(`oauth-model-providers: ${command} was not matched by the host command registry`)
      }
    }, (error: unknown) => {
      ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
    })
  }

  const subscribe = (listener: () => void): (() => void) => {
    const stopCredential = ctx.remote.$on('credentials/updated', (ref) => {
      if (ref === refs.codex || ref === refs.claude) listener()
    })
    const stopConnection = ctx.on('connection/reset', listener)
    return () => { stopCredential(); stopConnection() }
  }

  const injected = (): SettingsInjected => ({ describe, runCommand, subscribe })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'oauth-providers',
    order: 15,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    inject: injected,
  }, OAuthSettingsSection))
}
