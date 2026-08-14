import type { Models, OAuthCredential } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-user-questions'
import type { HarnessOAuthCredentialStore } from './credential-store.ts'
import type { ResolvedOAuthProviderConfig } from './config.ts'
import { createAuthInteraction } from './interaction.ts'

function expiryText(credential: OAuthCredential): string {
  if (credential.expires <= Date.now()) return 'expired; it will refresh on the next model request'
  return `valid until ${new Date(credential.expires).toISOString()}`
}

/** Register login, status, and local logout commands when the command service is present. */
export function installOAuthCommands(
  ctx: Context,
  models: Models,
  store: HarnessOAuthCredentialStore,
  authProviderId: string,
  providerName: string,
  config: ResolvedOAuthProviderConfig,
  setAvailable: (available: boolean) => void,
): void {
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: config.loginCommand,
      description: `Sign in to ${providerName} with OAuth.`,
      recordInput: false,
      handler: async ({ agent, signal }) => {
        const questions = commandCtx.get('userQuestions')
        if (questions === undefined) {
          return { kind: 'error', text: `${providerName} sign-in requires an interactive user-questions provider.` }
        }
        const interaction = createAuthInteraction(
          questions,
          agent,
          signal,
          providerName,
          (error) => {
            commandCtx.logger.warn(`oauth-model-provider: ${providerName} sign-in notice failed`)
            commandCtx.logger.warn(error)
          },
        )
        try {
          await models.login(authProviderId, 'oauth', interaction)
          setAvailable(true)
          return { kind: 'success', text: `${providerName} OAuth sign-in completed.` }
        } finally {
          interaction.close()
        }
      },
    })

    commandCtx.commands.register({
      name: config.statusCommand,
      description: `Show local ${providerName} OAuth status.`,
      recordInput: false,
      handler: async () => {
        const stored = await store.read(authProviderId)
        if (stored?.type !== 'oauth') {
          return { kind: 'success', text: `${providerName} is not signed in.` }
        }
        return { kind: 'success', text: `${providerName} is signed in; access token ${expiryText(stored)}.` }
      },
    })

    commandCtx.commands.register({
      name: config.logoutCommand,
      description: `Remove locally stored ${providerName} OAuth tokens.`,
      recordInput: false,
      handler: async () => {
        await models.logout(authProviderId)
        setAvailable(false)
        return {
          kind: 'success',
          text: `${providerName} local OAuth tokens were removed. Revoke the remote grant in your provider account if needed.`,
        }
      },
    })
  })
}
