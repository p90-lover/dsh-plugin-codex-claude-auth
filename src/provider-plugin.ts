import {
  createModels,
  type ModelAuth,
  type MutableModels,
  type Provider,
} from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { DirectoryRegistrationHandle, LlmConfigurableProvider } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type { OAuthProviderConfig, OAuthProviderDefaults } from './config.ts'
import { resolveOAuthProviderConfig } from './config.ts'
import { credentialBackend, HarnessOAuthCredentialStore } from './credential-store.ts'
import { installOAuthCommands } from './commands.ts'
import { installBrowserOAuth } from './browser-auth.ts'
import { ProviderProxySetting, proxyAwareProvider } from './proxy.ts'
import { routedProvider } from './routed-provider.ts'

const DIRECTORY_SETTINGS_SCHEMA = z.object({})

/** Provider facts fixed by one exported plugin entry point. */
export interface OAuthProviderSpec {
  authProviderId: string
  defaults: OAuthProviderDefaults
  createProvider(): Provider
}

function accessToken(auth: ModelAuth | undefined, providerName: string): string {
  const value = auth?.apiKey
  if (value === undefined || value.length === 0) {
    throw new LlmError(
      `${providerName} is not signed in; run its OAuth login command in an interactive DeepSeek Harness profile`,
      'MISSING_CREDENTIAL',
    )
  }
  return value
}

/** Mount one OAuth-authenticated pi-ai provider on the Harness LLM seam. */
export function applyOAuthProvider(
  ctx: Context,
  source: OAuthProviderConfig,
  spec: OAuthProviderSpec,
): void {
  const config = resolveOAuthProviderConfig(source, spec.defaults)
  const baseProvider = spec.createProvider()
  if (baseProvider.id !== spec.authProviderId) {
    throw new Error(
      `oauth-model-provider: factory returned provider "${baseProvider.id}", expected "${spec.authProviderId}"`,
    )
  }

  const backend = credentialBackend(ctx.credentials)
  const proxy = new ProviderProxySetting(backend, config.proxyCredentialRef)
  const provider = proxyAwareProvider(baseProvider, () => proxy.value)
  const store = new HarnessOAuthCredentialStore(
    backend,
    new Map([[spec.authProviderId, config.credentialRef]]),
  )
  const authModels: MutableModels = createModels({ credentials: store })
  authModels.setProvider(provider)

  const routeProvider = routedProvider(provider, config.route, config.displayName)
  const profile: ResolvedPiAiProviderProfile = {
    provider: config.route,
    displayName: config.displayName,
    streamIdleTimeoutMs: config.streamIdleTimeoutMs,
    retryPolicy: config.retryPolicy,
    piProvider: routeProvider,
    configuredMaxTokens: new Map(),
    ...config.transport === undefined ? {} : { transport: config.transport },
    ...config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs },
    ...config.websocketConnectTimeoutMs === undefined
      ? {}
      : { websocketConnectTimeoutMs: config.websocketConnectTimeoutMs },
  }
  const profiles = new Map([[config.route, profile]])
  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: async () => accessToken((await authModels.getAuth(spec.authProviderId))?.auth, config.displayName),
    resolveAttachments: () => ctx.get('attachments'),
  })

  const registration = ctx.llm.registerAdapter([config.route], adapter)
  registration.replace([])
  const settingsNs = settingsNamespace(`oauth-model-provider-${config.route}`)
  const directoryEntry: LlmConfigurableProvider = {
    provider: config.route,
    displayName: config.displayName,
    settingsNs,
    settingsPath: [],
  }
  installSettingsSection(ctx, settingsNs, DIRECTORY_SETTINGS_SCHEMA, {}, {
    setSource: () => undefined,
    onChange: () => undefined,
  })

  let availabilityRevision = 0
  let routeAvailable = false
  let directoryAvailable = false
  let directory: DirectoryRegistrationHandle | undefined
  const setAvailable = (available: boolean): void => {
    availabilityRevision += 1
    if (routeAvailable !== available) {
      registration.replace(available ? [config.route] : [])
      routeAvailable = available
    }
    if (directoryAvailable === available) return
    try {
      if (directory === undefined) {
        if (!available) return
        directory = ctx.llm.registerConfigurableProviders([directoryEntry])
      } else {
        directory.replace(available ? [directoryEntry] : [])
      }
      directoryAvailable = available
    } catch (error) {
      ctx.logger.warn(`oauth-model-provider: could not ${available ? 'publish' : 'hide'} ${config.displayName} in the Models provider directory`)
      ctx.logger.warn(error)
    }
  }

  ctx.effect(() => {
    let live = true
    const bootstrapRevision = availabilityRevision
    void Promise.all([
      store.read(spec.authProviderId),
      proxy.refresh().then(() => undefined),
    ]).then(([stored]) => {
      if (live && availabilityRevision === bootstrapRevision && stored?.type === 'oauth') setAvailable(true)
    }, (error) => {
      if (!live) return
      ctx.logger.warn(`oauth-model-provider: could not read initial ${config.displayName} OAuth/proxy state`)
      ctx.logger.warn(error)
    })
    return () => { live = false }
  }, `oauth-model-provider: initial ${config.route} credential/proxy state`)

  ctx.on('credentials/updated', (ref) => {
    if (ref === config.proxyCredentialRef) {
      void proxy.refresh().catch((error: unknown) => {
        ctx.logger.warn(`oauth-model-provider: could not refresh ${config.displayName} proxy state`)
        ctx.logger.warn(error)
      })
      return
    }
    if (ref !== config.credentialRef) return
    void store.read(spec.authProviderId).then(
      stored => { setAvailable(stored?.type === 'oauth') },
      (error: unknown) => {
        ctx.logger.warn(`oauth-model-provider: could not refresh ${config.displayName} OAuth state`)
        ctx.logger.warn(error)
      },
    )
  })

  installBrowserOAuth(
    ctx,
    authModels,
    store,
    proxy,
    spec.authProviderId,
    config.displayName,
    config.route,
    setAvailable,
  )

  installOAuthCommands(
    ctx,
    authModels,
    store,
    spec.authProviderId,
    config.displayName,
    config,
    setAvailable,
  )
}
