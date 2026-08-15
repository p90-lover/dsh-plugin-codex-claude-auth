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
import { autoModelProvider } from './model-discovery.ts'
import type { OAuthModelCatalog } from './model-discovery.ts'
import { ProviderProxySetting, proxyAwareProvider } from './proxy.ts'
import { AccountRotatingAdapter, ReplayCompatibleAdapter } from './replay-compat.ts'
import { AccountUsageMonitor } from './account-usage.ts'
import { routedProvider } from './routed-provider.ts'
import { openAiRemoteCompactionProvider } from './remote-compaction.ts'

const DIRECTORY_SETTINGS_SCHEMA = z.object({})

/** Provider facts fixed by one exported plugin entry point. */
export interface OAuthProviderSpec {
  authProviderId: string
  modelCatalog: OAuthModelCatalog
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
  const proxy = new ProviderProxySetting(
    backend,
    config.proxyCredentialRef,
    config.sharedProxyCredentialRef,
    spec.authProviderId,
  )
  const provider = proxyAwareProvider(
    openAiRemoteCompactionProvider(autoModelProvider(baseProvider, spec.modelCatalog)),
    () => proxy.value,
  )
  const store = new HarnessOAuthCredentialStore(
    backend,
    new Map([[spec.authProviderId, config.credentialRef]]),
  )
  const authModels: MutableModels = createModels({ credentials: store })
  authModels.setProvider(provider)
  const usage = new AccountUsageMonitor(
    spec.authProviderId,
    store,
    proxyId => proxy.valueForAssignment(proxyId),
  )

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
  const baseAdapter = new ReplayCompatibleAdapter(
    new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: async () => accessToken(
        (await authModels.getAuth(spec.authProviderId))?.auth,
        config.displayName,
      ),
      resolveAttachments: () => ctx.get('attachments'),
    }),
    config.route,
    spec.authProviderId,
  )
  const adapter = new AccountRotatingAdapter(baseAdapter, async () => {
    const reset = await usage.consumeActiveResetCredit()
    if (reset !== undefined) return { kind: 'reset' as const, from: reset, to: reset }
    const switched = await store.rotateNext(spec.authProviderId)
    if (switched !== undefined) {
      proxy.setActiveAccountProxyId(switched.to.proxyId)
      usage.invalidate()
    }
    return switched
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

  let refreshingModels: Promise<void> | undefined
  const refreshModels = (force = false): Promise<void> => {
    if (refreshingModels !== undefined) return refreshingModels
    const task = (async () => {
      try {
        const result = await authModels.refresh({ allowNetwork: true, force })
        const error = result.errors.get(spec.authProviderId)
        if (error !== undefined) {
          ctx.logger.warn(
            `oauth-model-provider: ${config.displayName} remote model discovery failed; keeping the last known catalog`,
          )
          ctx.logger.warn(error)
        }
        if (routeAvailable) registration.replace([config.route])
      } catch (error) {
        ctx.logger.warn(
          `oauth-model-provider: could not publish the refreshed ${config.displayName} model catalog`,
        )
        ctx.logger.warn(error)
      }
    })()
    refreshingModels = task
    const clear = (): void => {
      if (refreshingModels === task) refreshingModels = undefined
    }
    void task.then(clear, clear)
    return task
  }

  ctx.effect(() => {
    let live = true
    const bootstrapRevision = availabilityRevision
    void Promise.all([
      store.read(spec.authProviderId),
      store.accounts(spec.authProviderId),
      proxy.refresh().then(() => undefined),
    ]).then(async ([stored, accounts]) => {
      if (!live || availabilityRevision !== bootstrapRevision || stored?.type !== 'oauth') return
      proxy.setActiveAccountProxyId(accounts.find(account => account.active)?.proxyId)
      setAvailable(true)
      await refreshModels()
    }, (error) => {
      if (!live) return
      ctx.logger.warn(`oauth-model-provider: could not read initial ${config.displayName} OAuth/proxy state`)
      ctx.logger.warn(error)
    })
    return () => { live = false }
  }, `oauth-model-provider: initial ${config.route} credential/proxy state`)

  ctx.on('credentials/updated', (ref) => {
    if (ref === config.proxyCredentialRef || ref === config.sharedProxyCredentialRef) {
      void proxy.refresh().then(
        () => routeAvailable ? refreshModels(true) : undefined,
      ).catch((error: unknown) => {
        ctx.logger.warn(`oauth-model-provider: could not refresh ${config.displayName} proxy/model state`)
        ctx.logger.warn(error)
      })
      return
    }
    if (ref !== config.credentialRef) return
    void Promise.all([store.read(spec.authProviderId), store.accounts(spec.authProviderId)]).then(
      async ([stored, accounts]) => {
        const available = stored?.type === 'oauth'
        proxy.setActiveAccountProxyId(accounts.find(account => account.active)?.proxyId)
        setAvailable(available)
        if (available) await refreshModels(true)
      },
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
    usage,
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
