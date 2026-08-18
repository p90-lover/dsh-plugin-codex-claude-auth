import type { HarnessOAuthCredentialStore } from './credential-store.ts'

export const DEFAULT_OPENAI_CONTEXT_WINDOW = 252_000
export const MIN_OPENAI_CONTEXT_WINDOW = 252_000
export const MAX_OPENAI_CONTEXT_WINDOW = 1_000_000
export const OPENAI_CONTEXT_WINDOW_OPTIONS = [252_000, 353_000, 500_000, 1_000_000] as const
export const OPENAI_AUTO_COMPACT_RATIO = 0.9

export interface ContextWindowStatus {
  selected: number
  options: readonly number[]
  minimum: number
  maximum: number
  autoCompactAt: number
}

function supported(value: number): boolean {
  return Number.isInteger(value)
    && value >= MIN_OPENAI_CONTEXT_WINDOW
    && value <= MAX_OPENAI_CONTEXT_WINDOW
}

/** Credential-backed effective OpenAI context capacity shared by catalog publication and Settings. */
export class OpenAIContextWindowPreference {
  private selected = DEFAULT_OPENAI_CONTEXT_WINDOW

  constructor(private readonly store: HarnessOAuthCredentialStore) {}

  get value(): number {
    return this.selected
  }

  async load(): Promise<void> {
    const stored = await this.store.contextWindow('openai-codex')
    if (stored !== undefined && supported(stored)) this.selected = stored
  }

  status(): ContextWindowStatus {
    return {
      selected: this.selected,
      options: [...OPENAI_CONTEXT_WINDOW_OPTIONS],
      minimum: MIN_OPENAI_CONTEXT_WINDOW,
      maximum: MAX_OPENAI_CONTEXT_WINDOW,
      autoCompactAt: Math.floor(this.selected * OPENAI_AUTO_COMPACT_RATIO),
    }
  }

  async set(value: number): Promise<void> {
    if (!supported(value)) {
      throw new Error(
        `OpenAI context window must be an integer between ${MIN_OPENAI_CONTEXT_WINDOW} and ${MAX_OPENAI_CONTEXT_WINDOW}.`,
      )
    }
    await this.store.setContextWindow('openai-codex', value)
    this.selected = value
  }
}
