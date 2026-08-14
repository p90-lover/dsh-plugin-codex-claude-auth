import type { Transport } from '@earendil-works/pi-ai'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { RetryPolicySchema, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { ResolvedRetryPolicy, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'

const COMMAND_NAME = /^[a-z][a-z0-9_-]*$/u
const MAX_TIMER_DELAY_MS = 2_147_483_647
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000

/** Provider-specific defaults used to build one exported plugin schema. */
export interface OAuthProviderDefaults {
  route: string
  displayName: string
  credentialRef: string
  proxyCredentialRef: string
  loginCommand: string
  statusCommand: string
  logoutCommand: string
}

/** Deployment configuration shared by the OpenAI and Anthropic entry points. */
export interface OAuthProviderConfig {
  route?: string
  displayName?: string
  credentialRef?: string
  proxyCredentialRef?: string
  loginCommand?: string
  statusCommand?: string
  logoutCommand?: string
  transport?: Transport
  timeoutMs?: number
  websocketConnectTimeoutMs?: number
  streamIdleTimeoutMs?: number
  retryPolicy?: RetryPolicyConfig
}

/** Fully validated values captured by one mounted provider route. */
export interface ResolvedOAuthProviderConfig {
  route: string
  displayName: string
  credentialRef: CredentialRef
  proxyCredentialRef: CredentialRef
  loginCommand: string
  statusCommand: string
  logoutCommand: string
  transport?: Transport
  timeoutMs?: number
  websocketConnectTimeoutMs?: number
  streamIdleTimeoutMs: number
  retryPolicy: ResolvedRetryPolicy
}

/** Build the Cordis configuration schema for one provider entry point. */
export function oauthProviderConfig(defaults: OAuthProviderDefaults): z<OAuthProviderConfig> {
  return z.object({
    route: z.string().default(defaults.route),
    displayName: z.string().default(defaults.displayName),
    credentialRef: z.string().role('credential-ref').default(defaults.credentialRef),
    proxyCredentialRef: z.string().role('credential-ref').default(defaults.proxyCredentialRef),
    loginCommand: z.string().default(defaults.loginCommand),
    statusCommand: z.string().default(defaults.statusCommand),
    logoutCommand: z.string().default(defaults.logoutCommand),
    transport: z.union(['sse', 'websocket', 'websocket-cached', 'auto']),
    timeoutMs: z.natural(),
    websocketConnectTimeoutMs: z.natural(),
    streamIdleTimeoutMs: z.number()
      .min(Number.MIN_VALUE)
      .max(MAX_TIMER_DELAY_MS)
      .default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    retryPolicy: RetryPolicySchema,
  })
}

function required(value: string | undefined, fallback: string, field: string): string {
  const resolved = value ?? fallback
  if (resolved.length === 0) throw new Error(`oauth-model-provider: ${field} must not be empty`)
  return resolved
}

function commandName(value: string | undefined, fallback: string, field: string): string {
  const resolved = required(value, fallback, field)
  if (!COMMAND_NAME.test(resolved)) {
    throw new Error(`oauth-model-provider: ${field} "${resolved}" must match ${String(COMMAND_NAME)}`)
  }
  return resolved
}

/** Resolve schema defaults again for programmatic mounts and validate relationships. */
export function resolveOAuthProviderConfig(
  source: OAuthProviderConfig,
  defaults: OAuthProviderDefaults,
): ResolvedOAuthProviderConfig {
  const route = required(source.route, defaults.route, 'route')
  const displayName = required(source.displayName, defaults.displayName, 'displayName')
  const credentialName = required(source.credentialRef, defaults.credentialRef, 'credentialRef')
  const proxyCredentialName = required(
    source.proxyCredentialRef,
    defaults.proxyCredentialRef,
    'proxyCredentialRef',
  )
  if (credentialName === proxyCredentialName) {
    throw new Error('oauth-model-provider: credentialRef and proxyCredentialRef must be distinct')
  }
  const streamIdleTimeoutMs = source.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `oauth-model-provider: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  const loginCommand = commandName(source.loginCommand, defaults.loginCommand, 'loginCommand')
  const statusCommand = commandName(source.statusCommand, defaults.statusCommand, 'statusCommand')
  const logoutCommand = commandName(source.logoutCommand, defaults.logoutCommand, 'logoutCommand')
  if (new Set([loginCommand, statusCommand, logoutCommand]).size !== 3) {
    throw new Error('oauth-model-provider: loginCommand, statusCommand, and logoutCommand must be distinct')
  }
  return {
    route,
    displayName,
    credentialRef: credentialRef(credentialName),
    proxyCredentialRef: credentialRef(proxyCredentialName),
    loginCommand,
    statusCommand,
    logoutCommand,
    ...source.transport === undefined ? {} : { transport: source.transport },
    ...source.timeoutMs === undefined ? {} : { timeoutMs: source.timeoutMs },
    ...source.websocketConnectTimeoutMs === undefined
      ? {}
      : { websocketConnectTimeoutMs: source.websocketConnectTimeoutMs },
    streamIdleTimeoutMs,
    retryPolicy: resolveRetryPolicy(source.retryPolicy, `oauth-model-provider route "${route}" retryPolicy`),
  }
}
