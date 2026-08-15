import type { HarnessOAuthCredentialStore } from './credential-store.ts'

export const DEFAULT_OPENAI_CONTEXT_WINDOW = 252_000
export const OPENAI_CONTEXT_WINDOW_OPTIONS = [252_000, 353_000] as const

export interface ContextWindowStatus {
  selected: number
  options: readonly number[]
}

/** Durable OpenAI context-capacity metadata used by DSH pressure and compaction. */
export class OpenAIContextWindowPreference {
  private selected = DEFAULT_OPENAI_CONTEXT_WINDOW

  constructor(private readonly store: HarnessOAuthCredentialStore) {}

  value = (): number => this.selected

  status(): ContextWindowStatus {
    return { selected: this.selected, options: [...OPENAI_CONTEXT_WINDOW_OPTIONS] }
  }

  async load(): Promise<void> {
    const stored = await this.store.contextWindow('openai-codex')
    this.selected = OPENAI_CONTEXT_WINDOW_OPTIONS.includes(
      stored as (typeof OPENAI_CONTEXT_WINDOW_OPTIONS)[number],
    ) ? stored! : DEFAULT_OPENAI_CONTEXT_WINDOW
  }

  async set(value: number): Promise<void> {
    if (!OPENAI_CONTEXT_WINDOW_OPTIONS.includes(
      value as (typeof OPENAI_CONTEXT_WINDOW_OPTIONS)[number],
    )) {
      throw new Error('Context window must be 252000 or 353000 tokens.')
    }
    await this.store.setContextWindow('openai-codex', value)
    this.selected = value
  }
}
