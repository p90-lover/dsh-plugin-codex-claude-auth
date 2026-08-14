import type {
  AuthEvent,
  AuthInteraction,
  AuthPrompt,
} from '@earendil-works/pi-ai'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {
  AskUserQuestionAnswerItem,
  AskUserQuestionItem,
  UserQuestionService,
} from '@deepseek-ai/dsh-user-questions'

/** Auth interaction that can retract outstanding informational questions. */
export interface ManagedAuthInteraction extends AuthInteraction {
  close(): void
}

function combinedSignal(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const present = signals.filter((signal): signal is AbortSignal => signal !== undefined)
  if (present.length === 0) return undefined
  if (present.length === 1) return present[0]
  return AbortSignal.any(present)
}

function answerValue(answer: AskUserQuestionAnswerItem | undefined): string | undefined {
  const custom = answer?.custom?.trim()
  if (custom !== undefined && custom.length > 0) return custom
  return answer?.selected[0]
}

/** Bridge pi-ai's OAuth callbacks to the Harness question UI. */
export function createAuthInteraction(
  questions: UserQuestionService,
  agent: Agent,
  signal: AbortSignal,
  providerName: string,
  onBackgroundError: (error: unknown) => void,
): ManagedAuthInteraction {
  let sequence = 0
  let authUrl: string | undefined
  const notices = new Set<AbortController>()
  const nextId = (): string => {
    sequence += 1
    return `oauth-${sequence}`
  }
  const ask = (question: AskUserQuestionItem, promptSignal?: AbortSignal) => {
    const askSignal = combinedSignal(signal, promptSignal)
    return questions.ask({
      questions: [question],
      agent,
      ...askSignal === undefined ? {} : { signal: askSignal },
    })
  }

  const interaction: ManagedAuthInteraction = {
    signal,

    async prompt(prompt: AuthPrompt): Promise<string> {
      const id = nextId()
      if (prompt.type === 'select') {
        const result = await ask({
          id,
          header: `${providerName} sign-in`,
          question: prompt.message,
          options: prompt.options.map(option => ({
            label: option.label,
            ...option.description === undefined ? {} : { description: option.description },
          })),
        }, prompt.signal)
        const value = answerValue(result.answers.find(answer => answer.id === id))
        const selected = prompt.options.find(option => option.label === value || option.id === value)
        if (selected === undefined) throw new Error(`${providerName} sign-in was cancelled`)
        return selected.id
      }

      const detail = authUrl === undefined
        ? undefined
        : `Open this URL in a browser, then return here if the provider asks you to paste the redirect URL:\n\n${authUrl}`
      const result = await ask({
        id,
        header: `${providerName} sign-in`,
        question: prompt.message,
        ...detail === undefined ? {} : { detail },
      }, prompt.signal)
      const value = answerValue(result.answers.find(answer => answer.id === id))
      if (value === undefined) throw new Error(`${providerName} sign-in was cancelled`)
      return value
    },

    notify(event: AuthEvent): void {
      if (event.type === 'auth_url') {
        authUrl = event.url
        return
      }
      if (event.type !== 'device_code') return
      const controller = new AbortController()
      notices.add(controller)
      const id = nextId()
      const detail = `Verification URL: ${event.verificationUri}\n\nCode: ${event.userCode}`
      const noticeSignal = combinedSignal(signal, controller.signal)
      void questions.ask({
        questions: [{
          id,
          header: `${providerName} sign-in`,
          question: 'Open the verification URL and enter this device code.',
          detail,
          options: [{ label: 'Done', description: 'The provider will finish as soon as authorization is complete.' }],
        }],
        agent,
        ...noticeSignal === undefined ? {} : { signal: noticeSignal },
      }).catch((error: unknown) => {
        if (!controller.signal.aborted && !signal.aborted) onBackgroundError(error)
      }).finally(() => {
        notices.delete(controller)
      })
    },

    close(): void {
      for (const notice of notices) notice.abort('OAuth flow settled')
      notices.clear()
    },
  }
  return interaction
}
