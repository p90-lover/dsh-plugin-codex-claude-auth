/** Public JSON wire contract. No Host services, credential values, or Node imports. */
export interface UsageWindow { id: 'five-hour' | 'weekly'; usedPercent: number; remainingPercent: number; resetsAt?: number; windowMinutes: number }
export interface PublicAccount {
  id: string; label: string; active: boolean; proxyId?: string; useResetCredit: boolean; failoverModel?: string; failoverEffort?: string
  usage: {
    source: 'openai-live' | 'claude-live' | 'unavailable'; usedPercent?: number; remainingPercent?: number; resetsAt?: number
    windowMinutes?: number; resetCredits?: number; windows?: readonly UsageWindow[]; error?: string
  }
}
export interface PublicProxy {
  configured: boolean; display?: string; source?: 'account' | 'provider' | 'default'
  providerConfigured: boolean; sharedConfigured: boolean
  entries: readonly { id: string; label: string; display: string; default: boolean }[]
  defaultProxyId?: string; providerProxyId?: string; activeAccountProxyId?: string
}
export interface PublicFailoverEntry {
  id: string; name: string; available: boolean; enabled: boolean
  models: readonly { id: string; name: string; efforts: readonly { id: string; name: string; description?: string }[]; defaultEffort?: string }[]
  defaultModel?: string; model?: string; effort?: string
}
export interface PublicProviderStatus {
  connected: boolean; accounts: readonly PublicAccount[]; proxy: PublicProxy
  contextWindow?: { selected: number; options: readonly number[]; minimum: number; maximum: number; modelLimits: Record<string, number> }
  failover: { providers: readonly PublicFailoverEntry[] }
}
export type OAuthPhase = 'starting' | 'input' | 'authorizing' | 'device_code' | 'complete' | 'error' | 'cancelled'
export interface PublicPrompt {
  id: string; type: 'text' | 'secret' | 'select' | 'manual_code'; message: string; placeholder?: string
  options?: readonly { id: string; label: string; description?: string }[]
}
export interface PublicFlow {
  id: string; providerName: string; phase: OAuthPhase; revision: number; connected: boolean
  prompt?: PublicPrompt; authUrl?: string; authInstructions?: string
  deviceCode?: { userCode: string; verificationUri: string; expiresInSeconds?: number }
  progress?: string; error?: string
}
