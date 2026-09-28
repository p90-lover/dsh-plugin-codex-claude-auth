import type { PublicFlow, PublicProviderStatus } from '../shared/contracts.ts'
export type ProviderStatus = PublicProviderStatus
export type FlowState = PublicFlow
export type ProviderId = 'codex' | 'claude'
export const PROVIDERS = [
  { id: 'codex' as const, name: 'OpenAI Codex', route: 'openai-codex-oauth', mark: 'O' },
  { id: 'claude' as const, name: 'Anthropic Claude', route: 'anthropic-oauth', mark: 'C' },
] as const
export const API_ROOT = '/plugins/dsh-oauth-model-providers/oauth'
export function providerEndpoint(id: ProviderId): string {
  const provider = PROVIDERS.find(item => item.id === id)!
  return `${API_ROOT}/${encodeURIComponent(provider.route)}`
}
export interface ProviderSnapshot {
  readonly data?: ProviderStatus
  readonly error?: string
  readonly loading: boolean
  readonly busy: boolean
  readonly updatedAt?: number
}
