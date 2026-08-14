import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import type { Context } from '@deepseek-ai/cordis'
import { oauthProviderConfig } from './config.ts'
import type { OAuthProviderConfig, OAuthProviderDefaults } from './config.ts'
import { applyOAuthProvider } from './provider-plugin.ts'

const DEFAULTS: OAuthProviderDefaults = {
  route: 'openai-codex-oauth',
  displayName: 'OpenAI Codex (OAuth)',
  credentialRef: 'DSH_OPENAI_CODEX_OAUTH',
  loginCommand: 'login-openai',
  statusCommand: 'status-openai',
  logoutCommand: 'logout-openai',
}

export const name = 'llm-openai-codex-oauth'
export const inject = ['llm', 'credentials']
export type Config = OAuthProviderConfig
export const Config = oauthProviderConfig(DEFAULTS)

/** Register ChatGPT-subscription Codex models through pi-ai OAuth. */
export function apply(ctx: Context, config: Config): void {
  applyOAuthProvider(ctx, config, {
    authProviderId: 'openai-codex',
    defaults: DEFAULTS,
    createProvider: openaiCodexProvider,
  })
}
