import { randomUUID } from 'node:crypto'
import type { OAuthCredential } from '@earendil-works/pi-ai'
import type { HarnessOAuthCredentialStore, PublicOAuthAccount } from './credential-store.ts'
import { withProviderProxy } from './proxy.ts'

export interface AccountUsageWindow {
  id: 'five-hour' | 'weekly'
  usedPercent: number
  remainingPercent: number
  resetsAt?: number
  windowMinutes: number
}

export interface AccountUsage {
  usedPercent?: number
  remainingPercent?: number
  resetsAt?: number
  windowMinutes?: number
  resetCredits?: number
  windows?: readonly AccountUsageWindow[]
  source: 'openai-live' | 'claude-live' | 'unavailable'
  error?: string
}

export interface PublicAccountWithUsage extends PublicOAuthAccount {
  usage: AccountUsage
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function percent(value: unknown): number | undefined {
  const parsed = number(value)
  if (parsed === undefined || parsed < 0) return undefined
  return Math.min(100, parsed <= 1 ? parsed * 100 : parsed)
}

function unixSeconds(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined
  }
  const parsed = number(value)
  if (parsed === undefined || parsed <= 0) return undefined
  return Math.floor(parsed > 10_000_000_000 ? parsed / 1000 : parsed)
}

function claudeWindow(
  id: AccountUsageWindow['id'],
  windowMinutes: number,
  value: unknown,
): AccountUsageWindow | undefined {
  const source = object(value)
  const usedPercent = percent(source?.utilization ?? source?.used_percent ?? source?.usedPercent)
  if (usedPercent === undefined) return undefined
  const resetsAt = unixSeconds(source?.resets_at ?? source?.reset_at ?? source?.resetsAt)
  return {
    id,
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    windowMinutes,
  }
}

/** Parse Claude Code's authenticated 5-hour and 7-day usage snapshot. */
export function claudeUsage(payload: unknown): AccountUsage {
  const root = object(payload)
  const windows = [
    claudeWindow('five-hour', 5 * 60, root?.five_hour ?? root?.fiveHour),
    claudeWindow('weekly', 7 * 24 * 60, root?.seven_day ?? root?.sevenDay),
  ].filter((value): value is AccountUsageWindow => value !== undefined)
  if (windows.length === 0) throw new Error('usage response did not include 5-hour or weekly limits')
  const usedPercent = Math.max(...windows.map(window => window.usedPercent))
  const resets = windows.flatMap(window => window.resetsAt === undefined ? [] : [window.resetsAt])
  return {
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
    ...(resets.length === 0 ? {} : { resetsAt: Math.min(...resets) }),
    windowMinutes: Math.min(...windows.map(window => window.windowMinutes)),
    windows,
    source: 'claude-live',
  }
}

function openAiUsage(payload: unknown): AccountUsage {
  const root = object(payload)
  const rateLimit = object(root?.rate_limit ?? root?.rateLimit ?? root?.rate_limits ?? root?.rateLimits)
  const primary = object(rateLimit?.primary ?? rateLimit?.primary_window ?? root?.primary)
  const secondary = object(rateLimit?.secondary ?? rateLimit?.secondary_window ?? root?.secondary)
  const windows = [primary, secondary].filter((value): value is Record<string, unknown> => value !== undefined)
  const used = windows.map(window => number(window.used_percent ?? window.usedPercent)).filter((value): value is number => value !== undefined)
  const resets = windows.map(window => number(window.reset_at ?? window.resets_at ?? window.resetsAt)).filter((value): value is number => value !== undefined)
  const durations = windows.map((window) => {
    const seconds = number(window.limit_window_seconds)
    const minutes = number(window.window_duration_mins ?? window.windowDurationMins)
    return seconds ?? (minutes === undefined ? undefined : minutes * 60)
  }).filter((value): value is number => value !== undefined)
  const credits = object(root?.rate_limit_reset_credits ?? root?.rateLimitResetCredits)
  const usedPercent = used.length === 0 ? undefined : Math.max(...used)
  const resetCredits = number(credits?.available_count ?? credits?.availableCount)
  return {
    ...usedPercent === undefined ? {} : { usedPercent, remainingPercent: Math.max(0, 100 - usedPercent) },
    ...resets.length === 0 ? {} : { resetsAt: Math.min(...resets) },
    ...durations.length === 0 ? {} : { windowMinutes: Math.round(Math.min(...durations) / 60) },
    ...resetCredits === undefined ? {} : { resetCredits },
    source: 'openai-live',
  }
}

async function fetchOpenAiUsage(credential: OAuthCredential): Promise<AccountUsage> {
  const record = credential as OAuthCredential & { accountId?: string }
  const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
    headers: {
      authorization: `Bearer ${credential.access}`,
      ...(record.accountId === undefined ? {} : { 'chatgpt-account-id': record.accountId }),
      accept: 'application/json',
    },
  })
  if (!response.ok) throw new Error(`usage request returned HTTP ${response.status}`)
  return openAiUsage(await response.json())
}

async function fetchClaudeUsage(credential: OAuthCredential): Promise<AccountUsage> {
  const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: {
      authorization: `Bearer ${credential.access}`,
      accept: 'application/json',
      'anthropic-beta': 'oauth-2025-04-20',
      'user-agent': 'claude-cli/2.1.80',
      'x-app': 'cli',
    },
  })
  if (!response.ok) throw new Error(`usage request returned HTTP ${response.status}`)
  return claudeUsage(await response.json())
}

export class AccountUsageMonitor {
  private cache: { at: number; value: readonly PublicAccountWithUsage[] } | undefined

  constructor(
    private readonly providerId: string,
    private readonly store: HarnessOAuthCredentialStore,
    private readonly getProxy: (proxyId?: string) => string | undefined,
  ) {}

  async read(force = false): Promise<readonly PublicAccountWithUsage[]> {
    const ttl = this.providerId === 'anthropic' ? 5 * 60_000 : 60_000
    if (!force && this.cache !== undefined && Date.now() - this.cache.at < ttl) return this.cache.value
    const entries = await this.store.accountCredentials(this.providerId)
    const value = await Promise.all(entries.map(async ({ account, credential }): Promise<PublicAccountWithUsage> => {
      try {
        const usage = await withProviderProxy(this.getProxy(account.proxyId), () => {
          if (this.providerId === 'openai-codex') return fetchOpenAiUsage(credential)
          if (this.providerId === 'anthropic') return fetchClaudeUsage(credential)
          throw new Error(`usage is not supported for provider ${this.providerId}`)
        })
        return { ...account, usage }
      } catch (error) {
        return { ...account, usage: { source: 'unavailable', error: error instanceof Error ? error.message : String(error) } }
      }
    }))
    this.cache = { at: Date.now(), value }
    return value
  }

  invalidate(): void { this.cache = undefined }

  async consumeActiveResetCredit(): Promise<{ label: string } | undefined> {
    if (this.providerId !== 'openai-codex') return undefined
    const entries = await this.store.accountCredentials(this.providerId)
    const active = entries.find(entry => entry.account.active)
    if (active === undefined || !active.account.useResetCredit) return undefined
    const snapshot = await this.read(true)
    const usage = snapshot.find(account => account.id === active.account.id)?.usage
    if ((usage?.resetCredits ?? 0) < 1 || (usage?.usedPercent ?? 0) < 100) return undefined
    const record = active.credential as OAuthCredential & { accountId?: string }
    const response = await withProviderProxy(this.getProxy(active.account.proxyId), () => fetch(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${active.credential.access}`,
          ...(record.accountId === undefined ? {} : { 'chatgpt-account-id': record.accountId }),
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ redeem_request_id: randomUUID() }),
      },
    ))
    if (!response.ok) return undefined
    const result = object(await response.json())
    const outcome = result?.outcome ?? result?.status
    if (outcome !== 'reset' && outcome !== 'already_redeemed' && outcome !== 'alreadyRedeemed') return undefined
    this.invalidate()
    return { label: active.account.label }
  }
}

export function isConfirmedUsageExhaustion(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : String(error)
  return /(?:usage[_ -]?limit[_ -]?exceeded|usage limit (?:has been )?reached|quota (?:is )?exhausted|insufficient_quota)/iu.test(message)
}
