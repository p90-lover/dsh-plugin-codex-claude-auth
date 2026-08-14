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

function serializeOAuthCredential(credential: OAuthCredential): string {
  return JSON.stringify(credential)
}

/**
 * pi-ai CredentialStore over DeepSeek Harness credential references.
 * Each provider owns one JSON-valued secret reference. Writes are serialized
 * per process; the underlying Harness provider owns durable atomic storage.
 */
export class HarnessOAuthCredentialStore implements CredentialStore {
  private readonly chains = new Map<string, Promise<unknown>>()

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
    return resolved === undefined ? undefined : parseOAuthCredential(resolved.value, providerId, ref)
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
      const current = await this.read(providerId)
      const next = await fn(current)
      if (next === undefined) return current
      if (next.type !== 'oauth') {
        throw new Error(`oauth-model-provider: ${providerId} only accepts OAuth credentials`)
      }
      await this.backend.set(ref, serializeOAuthCredential(next))
      return next
    })
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
