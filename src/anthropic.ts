import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic'
import type { Context } from '@deepseek-ai/cordis'
import { oauthProviderConfig } from './config.ts'
import type { OAuthProviderConfig, OAuthProviderDefaults } from './config.ts'
import { applyOAuthProvider } from './provider-plugin.ts'

const DEFAULTS: OAuthProviderDefaults = {
  route: 'anthropic-oauth',
  displayName: 'Anthropic Claude (OAuth)',
  credentialRef: 'DSH_ANTHROPIC_OAUTH',
  proxyCredentialRef: 'DSH_ANTHROPIC_PROXY',
  loginCommand: 'login-claude',
  statusCommand: 'status-claude',
  logoutCommand: 'logout-claude',
}

export const name = 'llm-anthropic-oauth'
export const inject = ['llm', 'credentials']
export type Config = OAuthProviderConfig
export const Config = oauthProviderConfig(DEFAULTS)

/** Register Claude Pro/Max models through pi-ai OAuth. */
export function apply(ctx: Context, config: Config): void {
  applyOAuthProvider(ctx, config, {
    authProviderId: 'anthropic',
    modelCatalog: 'anthropic',
    defaults: DEFAULTS,
    createProvider: anthropicProvider,
  })
}
