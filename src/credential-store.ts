import type {
  Credential,
  CredentialInfo,
  CredentialStore,
  OAuthCredential,
} from '@earendil-works/pi-ai'
import type {
  CredentialInfo as HarnessCredentialInfo,
  CredentialProvider,
  CredentialRef,
  ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'

/** Minimal credential backend used by the pi-ai store adapter and its tests. */
export interface HarnessCredentialBackend {
  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined>
  describe(ref: CredentialRef): Promise<HarnessCredentialInfo>
  set(ref: CredentialRef, value: string): Promise<void>
  unset(ref: CredentialRef): Promise<void>
}

function parseOAuthCredential(value: string, providerId: string, ref: CredentialRef): OAuthCredential {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new Error(
      `oauth-model-provider: stored credential ${String(ref)} for ${providerId} is not valid JSON`,
      { cause: error },
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`oauth-model-provider: stored credential ${String(ref)} for ${providerId} must be an object`)
  }
  const record = parsed as Record<string, unknown>
  if (record.type !== 'oauth'
    || typeof record.access !== 'string' || record.access.length === 0
    || typeof record.refresh !== 'string' || record.refresh.length === 0
    || typeof record.expires !== 'number' || !Number.isFinite(record.expires)) {
    throw new Error(
      `oauth-model-provider: stored credential ${String(ref)} for ${providerId} is not a usable OAuth credential`,
    )
  }
  return {
    ...record,
    type: 'oauth',
    access: record.access,
    refresh: record.refresh,
    expires: record.expires,
  }
}

interface StoredAccount {
  id: string
  label: string
  credential: OAuthCredential
  proxyId?: string
  useResetCredit?: boolean
  configuredUsage?: { usedPercent: number; resetsAt?: number }
}

interface StoredAccountBundle {
  version: 1
  activeAccountId: string
  accounts: StoredAccount[]
}

export interface PublicOAuthAccount {
  id: string
  label: string
  active: boolean
  proxyId?: string
  useResetCredit: boolean
  configuredUsage?: { usedPercent: number; resetsAt?: number }
}

function tokenClaims(token: string): Record<string, unknown> | undefined {
  const segment = token.split('.')[1]
  if (segment === undefined) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

function accountIdentity(credential: OAuthCredential, index: number): { id: string; label: string } {
  const record = credential as OAuthCredential & Record<string, unknown>
  const claims = tokenClaims(credential.access)
  const stable = [record.accountId, record.account_id, claims?.sub, claims?.['https://api.openai.com/auth']]
    .find(value => typeof value === 'string' && value.length > 0)
  const idSource = typeof stable === 'string' ? stable : credential.refresh
  const id = createHash('sha256').update(idSource).digest('hex').slice(0, 20)
  const email = [record.email, claims?.email].find(value => typeof value === 'string' && value.includes('@'))
  return { id, label: typeof email === 'string' ? email : `Account ${index}` }
}

function parseStoredValue(value: string, providerId: string, ref: CredentialRef): StoredAccountBundle {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { parsed = undefined }
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>
    if (record.version === 1 && typeof record.activeAccountId === 'string' && Array.isArray(record.accounts)) {
      const accounts = record.accounts.map((entry, index): StoredAccount => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
          throw new Error(`oauth-model-provider: invalid account entry ${index + 1} for ${providerId}`)
        }
        const item = entry as Record<string, unknown>
        const credential = parseOAuthCredential(JSON.stringify(item.credential), providerId, ref)
        const identity = accountIdentity(credential, index + 1)
        const configured = typeof item.configuredUsage === 'object' && item.configuredUsage !== null
          ? item.configuredUsage as Record<string, unknown>
          : undefined
        const usedPercent = typeof configured?.usedPercent === 'number' && Number.isFinite(configured.usedPercent)
          ? configured.usedPercent
          : undefined
        const resetsAt = typeof configured?.resetsAt === 'number' && Number.isFinite(configured.resetsAt)
          ? configured.resetsAt
          : undefined
        return {
          id: typeof item.id === 'string' && item.id.length > 0 ? item.id : identity.id,
          label: typeof item.label === 'string' && item.label.length > 0 ? item.label : identity.label,
          credential,
          ...typeof item.proxyId === 'string' && item.proxyId.length > 0 ? { proxyId: item.proxyId } : {},
          useResetCredit: item.useResetCredit === true,
          ...usedPercent === undefined ? {} : {
            configuredUsage: { usedPercent, ...(resetsAt === undefined ? {} : { resetsAt }) },
          },
        }
      })
      if (accounts.length === 0) throw new Error(`oauth-model-provider: ${providerId} account bundle is empty`)
      return {
        version: 1,
        activeAccountId: accounts.some(account => account.id === record.activeAccountId)
          ? record.activeAccountId
          : accounts[0]!.id,
        accounts,
      }
    }
  }
  const credential = parseOAuthCredential(value, providerId, ref)
  const identity = accountIdentity(credential, 1)
  return { version: 1, activeAccountId: identity.id, accounts: [{ ...identity, credential }] }
}

/**
 * pi-ai CredentialStore over DeepSeek Harness credential references.
 * Each provider owns one JSON-valued secret reference. Writes are serialized
 * per process; the underlying Harness provider owns durable atomic storage.
 */
export class HarnessOAuthCredentialStore implements CredentialStore {
  private readonly chains = new Map<string, Promise<unknown>>()
  private readonly enrolling = new Set<string>()

  constructor(
    private readonly backend: HarnessCredentialBackend,
    private readonly refs: ReadonlyMap<string, CredentialRef>,
  ) {}

  private ref(providerId: string): CredentialRef {
    const ref = this.refs.get(providerId)
    if (ref === undefined) throw new Error(`oauth-model-provider: no credential reference for ${providerId}`)
    return ref
  }

  private enqueue<T>(providerId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(providerId) ?? Promise.resolve()
    const next = (async () => {
      await previous.catch(() => undefined)
      return operation()
    })()
    this.chains.set(providerId, next.catch(() => undefined))
    return next
  }

  async read(providerId: string): Promise<Credential | undefined> {
    const ref = this.refs.get(providerId)
    if (ref === undefined) return undefined
    const resolved = await this.backend.resolve(ref)
    if (resolved === undefined) return undefined
    const bundle = parseStoredValue(resolved.value, providerId, ref)
    return bundle.accounts.find(account => account.id === bundle.activeAccountId)?.credential
  }

  async list(): Promise<readonly CredentialInfo[]> {
    const entries = await Promise.all([...this.refs.entries()].map(async ([providerId, ref]) => ({
      providerId,
      info: await this.backend.describe(ref),
    })))
    return entries
      .filter(entry => entry.info.configured)
      .map(entry => ({ providerId: entry.providerId, type: 'oauth' as const }))
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    const ref = this.ref(providerId)
    return this.enqueue(providerId, async () => {
      const resolved = await this.backend.resolve(ref)
      const bundle = resolved === undefined ? undefined : parseStoredValue(resolved.value, providerId, ref)
      const active = bundle?.accounts.find(account => account.id === bundle.activeAccountId)
      const current = active?.credential
      const next = await fn(current)
      if (next === undefined) return current
      if (next.type !== 'oauth') {
        throw new Error(`oauth-model-provider: ${providerId} only accepts OAuth credentials`)
      }
      const identity = accountIdentity(next, (bundle?.accounts.length ?? 0) + 1)
      let updated: StoredAccountBundle
      if (bundle === undefined) {
        updated = { version: 1, activeAccountId: identity.id, accounts: [{ ...identity, credential: next }] }
      } else if (this.enrolling.has(providerId)) {
        const matching = bundle.accounts.findIndex(account => account.id === identity.id)
        const account = {
          ...identity,
          credential: next,
          ...matching >= 0 && bundle.accounts[matching]!.proxyId !== undefined
            ? { proxyId: bundle.accounts[matching]!.proxyId }
            : {},
          useResetCredit: matching >= 0 ? bundle.accounts[matching]!.useResetCredit === true : false,
        }
        const accounts = matching < 0
          ? [...bundle.accounts, account]
          : bundle.accounts.map((existing, index) => index === matching ? account : existing)
        updated = { version: 1, activeAccountId: identity.id, accounts }
      } else {
        const account = active === undefined
          ? { ...identity, credential: next }
          : { ...active, credential: next }
        const accounts = active === undefined
          ? [...bundle.accounts, account]
          : bundle.accounts.map(existing => existing.id === active.id ? account : existing)
        updated = { version: 1, activeAccountId: account.id, accounts }
      }
      await this.backend.set(ref, JSON.stringify(updated))
      return next
    })
  }

  /** Mark the next credential write as a new-account enrollment, not a refresh. */
  beginEnrollment(providerId: string): () => void {
    this.enrolling.add(providerId)
    return () => { this.enrolling.delete(providerId) }
  }

  async accounts(providerId: string): Promise<readonly PublicOAuthAccount[]> {
    const ref = this.refs.get(providerId)
    if (ref === undefined) return []
    const resolved = await this.backend.resolve(ref)
    if (resolved === undefined) return []
    const bundle = parseStoredValue(resolved.value, providerId, ref)
    return bundle.accounts.map(account => ({
      id: account.id,
      label: account.label,
      active: account.id === bundle.activeAccountId,
      ...account.proxyId === undefined ? {} : { proxyId: account.proxyId },
      useResetCredit: account.useResetCredit === true,
      ...account.configuredUsage === undefined ? {} : { configuredUsage: { ...account.configuredUsage } },
    }))
  }

  select(providerId: string, accountId: string): Promise<void> {
    const ref = this.ref(providerId)
    return this.enqueue(providerId, async () => {
      const resolved = await this.backend.resolve(ref)
      if (resolved === undefined) throw new Error('No OAuth accounts are saved.')
      const bundle = parseStoredValue(resolved.value, providerId, ref)
      if (!bundle.accounts.some(account => account.id === accountId)) throw new Error('OAuth account not found.')
      await this.backend.set(ref, JSON.stringify({ ...bundle, activeAccountId: accountId }))
    })
  }

  setUseResetCredit(providerId: string, accountId: string, enabled: boolean): Promise<void> {
    const ref = this.ref(providerId)
    return this.enqueue(providerId, async () => {
      const resolved = await this.backend.resolve(ref)
      if (resolved === undefined) throw new Error('No OAuth accounts are saved.')
      const bundle = parseStoredValue(resolved.value, providerId, ref)
      if (!bundle.accounts.some(account => account.id === accountId)) throw new Error('OAuth account not found.')
      await this.backend.set(ref, JSON.stringify({
        ...bundle,
        accounts: bundle.accounts.map(account => account.id === accountId
          ? { ...account, useResetCredit: enabled }
          : account),
      }))
    })
  }

  setProxy(providerId: string, accountId: string, proxyId: string | undefined): Promise<void> {
    const ref = this.ref(providerId)
    return this.enqueue(providerId, async () => {
      const resolved = await this.backend.resolve(ref)
      if (resolved === undefined) throw new Error('No OAuth accounts are saved.')
      const bundle = parseStoredValue(resolved.value, providerId, ref)
      if (!bundle.accounts.some(account => account.id === accountId)) throw new Error('OAuth account not found.')
      await this.backend.set(ref, JSON.stringify({
        ...bundle,
        accounts: bundle.accounts.map((account) => {
          if (account.id !== accountId) return account
          if (proxyId === undefined) {
            const { proxyId: _removed, ...rest } = account
            return rest
          }
          return { ...account, proxyId }
        }),
      }))
    })
  }

  setConfiguredUsage(
    providerId: string,
    accountId: string,
    configuredUsage: { usedPercent: number; resetsAt?: number },
  ): Promise<void> {
    const ref = this.ref(providerId)
    return this.enqueue(providerId, async () => {
      const resolved = await this.backend.resolve(ref)
      if (resolved === undefined) throw new Error('No OAuth accounts are saved.')
      const bundle = parseStoredValue(resolved.value, providerId, ref)
      if (!bundle.accounts.some(account => account.id === accountId)) throw new Error('OAuth account not found.')
      await this.backend.set(ref, JSON.stringify({
        ...bundle,
        accounts: bundle.accounts.map(account => account.id === accountId
          ? { ...account, configuredUsage }
          : account),
      }))
    })
  }

  async accountCredentials(providerId: string): Promise<readonly {
    account: PublicOAuthAccount
    credential: OAuthCredential
  }[]> {
    const ref = this.refs.get(providerId)
    if (ref === undefined) return []
    const resolved = await this.backend.resolve(ref)
    if (resolved === undefined) return []
    const bundle = parseStoredValue(resolved.value, providerId, ref)
    return bundle.accounts.map(account => ({
      account: {
        id: account.id,
        label: account.label,
        active: account.id === bundle.activeAccountId,
        ...account.proxyId === undefined ? {} : { proxyId: account.proxyId },
        useResetCredit: account.useResetCredit === true,
        ...account.configuredUsage === undefined ? {} : { configuredUsage: { ...account.configuredUsage } },
      },
      credential: { ...account.credential },
    }))
  }

  async rotateNext(providerId: string): Promise<{ from: PublicOAuthAccount; to: PublicOAuthAccount } | undefined> {
    const entries = await this.accountCredentials(providerId)
    if (entries.length < 2) return undefined
    const index = entries.findIndex(entry => entry.account.active)
    const from = entries[index < 0 ? 0 : index]!.account
    const to = entries[(index < 0 ? 1 : index + 1) % entries.length]!.account
    await this.select(providerId, to.id)
    return { from, to: { ...to, active: true } }
  }

  delete(providerId: string): Promise<void> {
    const ref = this.ref(providerId)
    return this.enqueue(providerId, async () => {
      await this.backend.unset(ref)
    })
  }
}

/** Narrow the Harness service to the store adapter's structural backend. */
export function credentialBackend(provider: CredentialProvider): HarnessCredentialBackend {
  return provider
}
import { createHash } from 'node:crypto'
