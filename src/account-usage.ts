import type { OAuthCredential } from '@earendil-works/pi-ai'
import type { HarnessOAuthCredentialStore, PublicOAuthAccount } from './credential-store.ts'
import { withProviderProxy } from './proxy.ts'

export interface AccountUsage {
  usedPercent?: number
  remainingPercent?: number
  resetsAt?: number
  windowMinutes?: number
  resetCredits?: number
  source: 'openai-live' | 'configured' | 'unavailable'
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

export class AccountUsageMonitor {
  private cache: { at: number; value: readonly PublicAccountWithUsage[] } | undefined

  constructor(
    private readonly providerId: string,
    private readonly store: HarnessOAuthCredentialStore,
    private readonly getProxy: () => string | undefined,
  ) {}

  async read(force = false): Promise<readonly PublicAccountWithUsage[]> {
    if (!force && this.cache !== undefined && Date.now() - this.cache.at < 60_000) return this.cache.value
    const entries = await this.store.accountCredentials(this.providerId)
    const value = await Promise.all(entries.map(async ({ account, credential }): Promise<PublicAccountWithUsage> => {
      if (this.providerId !== 'openai-codex') {
        return {
          ...account,
          usage: account.configuredUsage === undefined
            ? { source: 'unavailable' }
            : {
                ...account.configuredUsage,
                remainingPercent: Math.max(0, 100 - account.configuredUsage.usedPercent),
                source: 'configured',
              },
        }
      }
      try {
        return { ...account, usage: await withProviderProxy(this.getProxy(), () => fetchOpenAiUsage(credential)) }
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
    const response = await withProviderProxy(this.getProxy(), () => fetch(
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
import { randomUUID } from 'node:crypto'
