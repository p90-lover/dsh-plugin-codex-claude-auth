import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import { ProviderService } from './api.ts'
import { ControlCenter } from './control-center.tsx'
import { ProviderPanel } from './accounts.tsx'
import { ComposerStatus } from './composer.tsx'
import { ReviewWidget } from './review-widget.tsx'
import type { ReviewInjected } from './review-widget.tsx'
import { PROVIDERS } from './contracts.ts'
import { styles } from './styles.ts'

/** Services are optional per feature so a missing review plugin cannot hide Settings. */
export const inject = ['slots', 'remote']
export function apply(ctx: ClientContext): void {
  const service = new ProviderService()
  ctx.effect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      for (const provider of PROVIDERS) if (service.snapshot(provider.id).data) void service.load(provider.id, true)
    }, 60_000)
    const refs = new Set(['DSH_OPENAI_CODEX_OAUTH', 'DSH_ANTHROPIC_OAUTH', 'DSH_OPENAI_CODEX_PROXY', 'DSH_ANTHROPIC_PROXY', 'DSH_OAUTH_SHARED_PROXY', 'DSH_OAUTH_FAILOVER_CONFIG'])
    const stopCredentials = ctx.remote.$on('credentials/reference-updated', ref => { if (refs.has(String(ref))) void service.refreshAll() })
    const stopConnection = ctx.on('connection/reset', () => { void service.refreshAll() })
    return () => { clearInterval(timer); stopCredentials(); stopConnection(); service.dispose() }
  }, 'oauth-control-center: shared state lifecycle')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'oauth-providers', order: 15, label: '模型與帳號 / OAuth', inject: () => ({ service }),
  }, ControlCenter))
  for (const provider of PROVIDERS) {
    ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
      name: 'settings.models.provider-card', key: `oauth-model-provider-${provider.route}`,
      inject: () => ({ service }),
    }, () => <div className="dsh-oauth"><style>{styles}</style><ProviderPanel service={service} id={provider.id} /></div>))
  }
  ctx.inject(['modelDirectories', 'sessions'], scope => {
    // The browser owns this service; Host and Client share a compilation unit here.
    const sessions = scope.get('sessions') as unknown as ISessions
    scope.slots.inject('conversation.composer.dock', () => scope.slots.register({
      name: 'conversation.composer.dock', id: 'oauth-provider-usage', order: 30,
      inject: sessionId => ({ service, directory: scope.modelDirectories.directoryFor(sessionId), available: sessions.subagentAddress(sessionId) === undefined }),
    }, ComposerStatus))
    scope.inject(['remote.commands'], reviewCtx => {
      reviewCtx.slots.inject('conversation.input.dock', () => reviewCtx.slots.register({
        name: 'conversation.input.dock', id: 'codex-code-review', order: 35,
        inject: (sessionId): ReviewInjected => ({
          directory: scope.modelDirectories.directoryFor(sessionId),
          checkAvailable: async () => {
            if (sessions.subagentAddress(sessionId) !== undefined) return false
            const result = await reviewCtx.remote.commands.list(sessionId)
            return result.ok && result.value.some(command => command.name === 'review')
          },
          runReview: async mode => {
            const result = await reviewCtx.remote.commands.execute(sessionId, mode === 'auto' ? '/review auto' : '/review', [])
            if (!result.ok) throw new Error(`${result.error.message} (${result.error.code})`)
            if (!result.value) throw new Error('The /review command is unavailable in this session.')
            if (result.value.result.kind === 'error') throw new Error(result.value.result.text ?? 'Review was refused.')
            const message = result.value.result.text ?? ''
            return { started: message.startsWith('Code review started'), message }
          },
        }),
      }, ReviewWidget))
    })
  })
}
