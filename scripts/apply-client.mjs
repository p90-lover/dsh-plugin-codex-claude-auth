import { readFileSync, writeFileSync } from 'node:fs'

function read(path) { return readFileSync(path, 'utf8') }
function write(path, content) { writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8') }
function replaceOnce(path, before, after) {
  const source = read(path)
  const count = source.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one replacement, found ${count}`)
  write(path, source.replace(before, after))
}
function replaceBetween(path, start, end, replacement) {
  const source = read(path)
  const startIndex = source.indexOf(start)
  if (startIndex < 0) throw new Error(`${path}: start marker not found: ${start.slice(0, 80)}`)
  const endIndex = source.indexOf(end, startIndex + start.length)
  if (endIndex < 0) throw new Error(`${path}: end marker not found: ${end.slice(0, 80)}`)
  if (source.indexOf(start, startIndex + start.length) >= 0) throw new Error(`${path}: start marker is not unique`)
  write(path, `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`)
}

const path = 'src/client/index.tsx'

replaceOnce(path, `import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'`, `import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'`)
replaceOnce(path, `import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'`, `import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  formatContextWindow,
  isPresetContextWindow,
  latestProviderFromNodes,
  providerIdFromRoute,
  remainingPercent,
} from './provider-usage.ts'`)

replaceOnce(path, `  contextWindow: 'Context', contextWindowTitle: 'OpenAI context window', contextWindowSaved: 'Context window saved',
  failoverNav: 'Failover', failoverTitle: 'Automatic provider failover',`, `  contextWindow: 'Context', contextWindowTitle: 'OpenAI context window', contextWindowSaved: 'Context window saved',
  contextWindowCustom: 'Custom', contextWindowRange: 'Custom range: {minimum}–{maximum}',
  contextAutoCompact: 'Auto-compact at {tokens} (90%)',
  failoverNav: 'Failover', failoverTitle: 'Automatic provider failover',`)
replaceOnce(path, `  failoverAutoMiddle: 'Auto (middle: {model})', failoverProviderModel: '{provider} default model',
  failoverAccountModel: '{provider} · {account}', failoverInherit: 'Inherit provider default',`, `  failoverAutoMiddle: 'Auto (middle: {model})', failoverProviderModel: '{provider} default model',
  failoverProviderEffort: '{provider} reasoning effort',
  failoverAccountModel: '{provider} · {account}', failoverAccountEffort: '{provider} · {account} effort',
  failoverInherit: 'Inherit provider default', failoverEffortAuto: 'Model default ({effort})',`)
replaceOnce(path, `  contextWindow: '上下文', contextWindowTitle: 'OpenAI 上下文視窗', contextWindowSaved: '上下文視窗已儲存',
  failoverNav: '自動切換', failoverTitle: '自動切換提供者',`, `  contextWindow: '上下文', contextWindowTitle: 'OpenAI 上下文視窗', contextWindowSaved: '上下文視窗已儲存',
  contextWindowCustom: '自訂', contextWindowRange: '自訂範圍：{minimum}–{maximum}',
  contextAutoCompact: '在 {tokens}（90%）自動壓縮',
  failoverNav: '自動切換', failoverTitle: '自動切換提供者',`)
replaceOnce(path, `  failoverAutoMiddle: '自動（中階：{model}）', failoverProviderModel: '{provider} 預設模型',
  failoverAccountModel: '{provider} · {account}', failoverInherit: '繼承提供者預設',`, `  failoverAutoMiddle: '自動（中階：{model}）', failoverProviderModel: '{provider} 預設模型',
  failoverProviderEffort: '{provider} 推理強度',
  failoverAccountModel: '{provider} · {account}', failoverAccountEffort: '{provider} · {account} 推理強度',
  failoverInherit: '繼承提供者預設', failoverEffortAuto: '模型預設（{effort}）',`)

replaceOnce(path, `  contextWindow?: {
    selected: number
    options: readonly number[]
  }`, `  contextWindow?: {
    selected: number
    options: readonly number[]
    minimum: number
    maximum: number
    autoCompactAt: number
  }`)
replaceOnce(path, `  models: readonly { id: string; name: string }[]
  defaultModel?: string
  model?: string
}`, `  models: readonly {
    id: string
    name: string
    efforts: readonly { id: string; name: string; description?: string }[]
    defaultEffort?: string
  }[]
  defaultModel?: string
  model?: string
  effort?: string
}`)
replaceOnce(path, `  useResetCredit: boolean
  failoverModel?: string
  usage: {`, `  useResetCredit: boolean
  failoverModel?: string
  failoverEffort?: string
  usage: {`)

replaceOnce(path, `  configureAccountFailoverModel: (provider: ProviderCard, accountId: string, modelId: string | null) => Promise<ProviderStatus>
  configureProviderFailoverModel: (provider: ProviderCard, providerId: string, modelId: string | null) => Promise<ProviderStatus>`, `  configureAccountFailoverModel: (provider: ProviderCard, accountId: string, modelId: string | null) => Promise<ProviderStatus>
  configureAccountFailoverEffort: (provider: ProviderCard, accountId: string, effortId: string | null) => Promise<ProviderStatus>
  configureProviderFailoverModel: (provider: ProviderCard, providerId: string, modelId: string | null) => Promise<ProviderStatus>
  configureProviderFailoverEffort: (provider: ProviderCard, providerId: string, effortId: string | null) => Promise<ProviderStatus>`)

replaceOnce(path, `const composerContextSelectStyle: CSSProperties = {
  height: 22,
  maxWidth: 70,`, `const composerContextSelectStyle: CSSProperties = {
  height: 22,
  maxWidth: 82,`)
replaceOnce(path, `}

function usageCircle(percent: number): CSSProperties {`, `}
const composerContextInputStyle: CSSProperties = {
  width: 78,
  height: 22,
  boxSizing: 'border-box',
  padding: '0 4px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 5,
  color: 'var(--dsw-alias-label-primary)',
  background: 'var(--dsw-alias-bg-base)',
  fontSize: 11,
  outline: 'none',
}

function usageCircle(percent: number): CSSProperties {`)

replaceOnce(path, `                                {provider.id === 'codex' ? <span style={usageCircle(used)} aria-label={\`\${used}%\`} /> : null}
                                {provider.id === 'codex' ? <span style={detail}>{used}%</span> : null}`, `                                {provider.id === 'codex' ? <span style={usageCircle(remaining)} aria-label={\`\${remaining}% remaining\`} /> : null}
                                {provider.id === 'codex' ? <span style={detail}>{remaining}%</span> : null}`)
replaceOnce(path, `                                            <span style={usageCircle(window.used)} aria-label={\`\${window.label}: \${window.used}%\`} />
                                            <span style={nameStyle}>{window.label}</span>
                                            <span style={detail}>{window.used}%</span>`, `                                            <span style={usageCircle(window.remaining)} aria-label={\`\${window.label}: \${window.remaining}% remaining\`} />
                                            <span style={nameStyle}>{window.label}</span>
                                            <span style={detail}>{window.remaining}%</span>`)

replaceOnce(path, `    || typeof candidate.configureAccountFailoverModel !== 'function'
    || typeof candidate.configureProviderFailoverModel !== 'function'`, `    || typeof candidate.configureAccountFailoverModel !== 'function'
    || typeof candidate.configureAccountFailoverEffort !== 'function'
    || typeof candidate.configureProviderFailoverModel !== 'function'
    || typeof candidate.configureProviderFailoverEffort !== 'function'`)
replaceOnce(path, `    describe, configureAccountFailoverModel, configureProviderFailoverModel,
    configureProviderFailoverEnabled, configureProviderFailoverOrder, subscribe,`, `    describe, configureAccountFailoverModel, configureAccountFailoverEffort,
    configureProviderFailoverModel, configureProviderFailoverEffort,
    configureProviderFailoverEnabled, configureProviderFailoverOrder, subscribe,`)

replaceOnce(path, `          const configuredModel = entry.model !== undefined && entry.models.some(model => model.id === entry.model)
            ? entry.model
            : ''
          return (`, `          const configuredModel = entry.model !== undefined && entry.models.some(model => model.id === entry.model)
            ? entry.model
            : ''
          const selectedModelId = configuredModel || entry.defaultModel
          const selectedModel = entry.models.find(model => model.id === selectedModelId)
          const configuredEffort = entry.effort !== undefined
            && selectedModel?.efforts.some(effort => effort.id === entry.effort)
            ? entry.effort
            : ''
          return (`)

replaceOnce(path, `              </label>
              {providers.filter(provider => provider.route === entry.id).flatMap((provider) => {
                const status = statuses?.[provider.id]
                return status?.accounts.map(account => (
                  <label key={account.id} style={accountRow} data-failover-account={\`\${provider.id}:\${account.id}\`}>
                    <span style={detail}>{format(copy, 'failoverAccountModel', { provider: entry.name, account: account.label })}</span>
                    <select
                      aria-label={format(copy, 'failoverAccountModel', { provider: entry.name, account: account.label })}
                      value={account.failoverModel !== undefined && entry.models.some(model => model.id === account.failoverModel) ? account.failoverModel : ''}
                      disabled={busy !== undefined || !entry.available}
                      onChange={(event) => { const value = event.currentTarget.value; void run(\`account:\${provider.id}:\${account.id}\`, () => configureAccountFailoverModel(provider, account.id, value.length === 0 ? null : value)) }}
                    >
                      <option value="">{format(copy, 'failoverInherit')}</option>
                      {entry.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                    </select>
                  </label>
                )) ?? []
              })}`, `              </label>
              <label style={accountRow}>
                <span style={detail}>{format(copy, 'failoverProviderEffort', { provider: entry.name })}</span>
                <select
                  aria-label={format(copy, 'failoverProviderEffort', { provider: entry.name })}
                  value={configuredEffort}
                  disabled={busy !== undefined || !entry.available || !entry.enabled || selectedModel === undefined || selectedModel.efforts.length === 0}
                  onChange={(event) => { const value = event.currentTarget.value; void run(\`effort:\${entry.id}\`, () => configureProviderFailoverEffort(target, entry.id, value.length === 0 ? null : value)) }}
                >
                  <option value="">{format(copy, 'failoverEffortAuto', {
                    effort: selectedModel?.efforts.find(effort => effort.id === selectedModel.defaultEffort)?.name
                      ?? selectedModel?.defaultEffort
                      ?? '—',
                  })}</option>
                  {selectedModel?.efforts.map(effort => <option key={effort.id} value={effort.id}>{effort.name}</option>)}
                </select>
              </label>
              {providers.filter(provider => provider.route === entry.id).flatMap((provider) => {
                const status = statuses?.[provider.id]
                return status?.accounts.flatMap((account) => {
                  const accountModelId = account.failoverModel !== undefined
                    && entry.models.some(model => model.id === account.failoverModel)
                    ? account.failoverModel
                    : selectedModelId
                  const accountModel = entry.models.find(model => model.id === accountModelId)
                  const accountEffort = account.failoverEffort !== undefined
                    && accountModel?.efforts.some(effort => effort.id === account.failoverEffort)
                    ? account.failoverEffort
                    : ''
                  return [
                    <label key={\`\${account.id}:model\`} style={accountRow} data-failover-account={\`\${provider.id}:\${account.id}\`}>
                      <span style={detail}>{format(copy, 'failoverAccountModel', { provider: entry.name, account: account.label })}</span>
                      <select
                        aria-label={format(copy, 'failoverAccountModel', { provider: entry.name, account: account.label })}
                        value={account.failoverModel !== undefined && entry.models.some(model => model.id === account.failoverModel) ? account.failoverModel : ''}
                        disabled={busy !== undefined || !entry.available}
                        onChange={(event) => { const value = event.currentTarget.value; void run(\`account:\${provider.id}:\${account.id}\`, () => configureAccountFailoverModel(provider, account.id, value.length === 0 ? null : value)) }}
                      >
                        <option value="">{format(copy, 'failoverInherit')}</option>
                        {entry.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                      </select>
                    </label>,
                    <label key={\`\${account.id}:effort\`} style={accountRow}>
                      <span style={detail}>{format(copy, 'failoverAccountEffort', { provider: entry.name, account: account.label })}</span>
                      <select
                        aria-label={format(copy, 'failoverAccountEffort', { provider: entry.name, account: account.label })}
                        value={accountEffort}
                        disabled={busy !== undefined || !entry.available || accountModel === undefined || accountModel.efforts.length === 0}
                        onChange={(event) => { const value = event.currentTarget.value; void run(\`account-effort:\${provider.id}:\${account.id}\`, () => configureAccountFailoverEffort(provider, account.id, value.length === 0 ? null : value)) }}
                      >
                        <option value="">{format(copy, 'failoverInherit')}</option>
                        {accountModel?.efforts.map(effort => <option key={effort.id} value={effort.id}>{effort.name}</option>)}
                      </select>
                    </label>,
                  ]
                }) ?? []
              })}`)

const usageReplacement = `interface ProviderUsageInjected {
  currentProvider(): ProviderId | undefined
  subscribeProvider(listener: () => void): () => void
  refreshModelDirectory(): Promise<void>
}

type ProviderUsageBoxProps = PropsRuntime<'conversation.input.right'>
  & PropsLocale<typeof NS>
  & InjectFace<ProviderUsageInjected>

function ProviderUsageBox({
  t,
  session,
  currentProvider,
  subscribeProvider,
  refreshModelDirectory,
}: ProviderUsageBoxProps): ReactNode {
  const [activeProvider, setActiveProvider] = useState<ProviderId | undefined>(() =>
    currentProvider() ?? latestProviderFromNodes(session.nodes))
  const [status, setStatus] = useState<ProviderStatus>()
  const [saving, setSaving] = useState(false)
  const [customValue, setCustomValue] = useState('')

  useEffect(() => {
    const update = (): void => {
      setActiveProvider(currentProvider() ?? latestProviderFromNodes(session.nodes))
    }
    update()
    return subscribeProvider(update)
  }, [currentProvider, session.nodes, subscribeProvider])

  useEffect(() => {
    if (activeProvider === undefined) {
      setStatus(undefined)
      return
    }
    const provider = providers.find(entry => entry.id === activeProvider)
    if (provider === undefined) return
    let live = true
    const load = (): void => {
      void requestJson<ProviderStatus>(\`\${provider.endpoint}/status\`).then((next) => {
        if (live) setStatus(next)
      }, () => {
        if (live) setStatus(undefined)
      })
    }
    load()
    const interval = window.setInterval(load, 60_000)
    return () => {
      live = false
      window.clearInterval(interval)
    }
  }, [activeProvider])

  const activeAccount = status?.accounts.find(account => account.active)
  const openAiRemaining = remainingPercent(
    activeAccount?.usage.remainingPercent,
    activeAccount?.usage.usedPercent,
  )
  const fiveHour = activeAccount?.usage.windows?.find(window => window.id === 'five-hour')
  const weekly = activeAccount?.usage.windows?.find(window => window.id === 'weekly')
  const fiveHourRemaining = remainingPercent(fiveHour?.remainingPercent, fiveHour?.usedPercent)
  const weeklyRemaining = remainingPercent(weekly?.remainingPercent, weekly?.usedPercent)
  const reset = (value: number | undefined): string => value === undefined
    ? t('usageResetUnknown')
    : new Date(value * 1000).toLocaleString()
  const title = activeAccount === undefined
    ? t('composerUsageUnavailable')
    : activeProvider === 'codex'
      ? \`OpenAI: \${openAiRemaining}% left · \${reset(activeAccount.usage.resetsAt)}\`
      : \`Claude 5h: \${fiveHourRemaining}% left · \${reset(fiveHour?.resetsAt)}; 7d: \${weeklyRemaining}% left · \${reset(weekly?.resetsAt)}\`

  const context = activeProvider === 'codex' ? status?.contextWindow : undefined
  const customSelected = context !== undefined
    && !isPresetContextWindow(context.selected, context.options)
  useEffect(() => {
    if (context !== undefined && customSelected) setCustomValue(String(context.selected))
  }, [context?.selected, customSelected])

  const setContextWindow = (value: number): void => {
    if (context === undefined
      || !Number.isInteger(value)
      || value < context.minimum
      || value > context.maximum) return
    const provider = providers.find(entry => entry.id === 'codex')!
    setSaving(true)
    void postJson<ProviderStatus>(provider, '/context-window', { value }).then(async (next) => {
      setStatus(next)
      await refreshModelDirectory()
    }).finally(() => { setSaving(false) })
  }
  const commitCustom = (): void => {
    const value = Number(customValue)
    if (Number.isInteger(value) && value !== context?.selected) setContextWindow(value)
  }

  return (
    <span style={composerUsageBoxStyle} title={title} aria-label={title} data-provider-usage-box data-active-provider={activeProvider}>
      {activeAccount === undefined
        ? <span>{t('composerUsageLoading')}</span>
        : activeProvider === 'codex'
          ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span style={compactUsageCircle(openAiRemaining)} />
                <span>OAI {openAiRemaining}%</span>
              </span>
            )
          : activeProvider === 'claude'
            ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span style={compactUsageCircle(Math.min(fiveHourRemaining, weeklyRemaining))} />
                  <span>C 5h {fiveHourRemaining}% · 7d {weeklyRemaining}%</span>
                </span>
              )
            : null}
      {context === undefined
        ? null
        : (
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
              title={t('contextAutoCompact', { tokens: formatContextWindow(context.autoCompactAt) })}
            >
              <span>{t('contextWindow')}</span>
              <select
                style={composerContextSelectStyle}
                value={customSelected ? 'custom' : String(context.selected)}
                disabled={saving}
                aria-label={t('contextWindowTitle')}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  if (value === 'custom') {
                    setCustomValue(String(context.selected))
                    return
                  }
                  setContextWindow(Number(value))
                }}
              >
                {context.options.map(option => (
                  <option key={option} value={option}>{formatContextWindow(option)}</option>
                ))}
                <option value="custom">{t('contextWindowCustom')}</option>
              </select>
              {customSelected
                ? (
                    <input
                      style={composerContextInputStyle}
                      type="number"
                      min={context.minimum}
                      max={context.maximum}
                      step={1_000}
                      value={customValue}
                      disabled={saving}
                      aria-label={t('contextWindowRange', {
                        minimum: formatContextWindow(context.minimum),
                        maximum: formatContextWindow(context.maximum),
                      })}
                      onChange={(event) => { setCustomValue(event.currentTarget.value) }}
                      onBlur={commitCustom}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          commitCustom()
                        }
                      }}
                    />
                  )
                : null}
            </label>
          )}
    </span>
  )
}

`
replaceBetween(path, `type ProviderUsageBoxProps = PropsRuntime<'conversation.input.right'>`, `export const inject =`, usageReplacement)

replaceOnce(path, `export const inject = ['slots', 'locale', 'remote']`, `export const inject = ['slots', 'locale', 'remote', 'modelDirectories']`)
replaceOnce(path, `    configureAccountFailoverModel: (provider, accountId, modelId) => postJson(provider, '/account/failover-model', { accountId, modelId }),
    configureProviderFailoverModel: (provider, providerId, modelId) => postJson(provider, '/failover/model', { providerId, modelId }),`, `    configureAccountFailoverModel: (provider, accountId, modelId) => postJson(provider, '/account/failover-model', { accountId, modelId }),
    configureAccountFailoverEffort: (provider, accountId, effortId) => postJson(provider, '/account/failover-effort', { accountId, effortId }),
    configureProviderFailoverModel: (provider, providerId, modelId) => postJson(provider, '/failover/model', { providerId, modelId }),
    configureProviderFailoverEffort: (provider, providerId, effortId) => postJson(provider, '/failover/effort', { providerId, effortId }),`)

replaceOnce(path, `  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'oauth-provider-usage',
    order: 30,
    label: () => ctx.locale.bind(NS)('composerUsage'),
    locale: NS,
  }, ProviderUsageBox))`, `  ctx.inject(['slots', 'modelDirectories'], (usageCtx) => {
    usageCtx.slots.inject('conversation.input.right', () => usageCtx.slots.register({
      name: 'conversation.input.right',
      id: 'oauth-provider-usage',
      order: 30,
      label: () => usageCtx.locale.bind(NS)('composerUsage'),
      locale: NS,
      inject: (sessionId): ProviderUsageInjected => {
        const directory = usageCtx.modelDirectories.directoryFor(sessionId)
        return {
          currentProvider: () => providerIdFromRoute(directory.store.getSnapshot().current?.provider),
          subscribeProvider: listener => directory.store.subscribe(listener),
          refreshModelDirectory: async () => { await directory.load() },
        }
      },
    }, ProviderUsageBox))
  })`)
