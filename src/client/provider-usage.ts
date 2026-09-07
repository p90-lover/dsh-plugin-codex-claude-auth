export type ComposerProviderId = 'codex' | 'claude'

export function providerIdFromRoute(route: string | undefined): ComposerProviderId | undefined {
  if (route === undefined) return undefined
  if (route === 'openai-codex-oauth' || route === 'openai-codex') return 'codex'
  if (route === 'anthropic-oauth' || route === 'anthropic') return 'claude'
  return undefined
}

export function latestProviderFromNodes(nodes: readonly unknown[]): ComposerProviderId | undefined {
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]
    if (typeof node !== 'object' || node === null || Array.isArray(node)) continue
    const record = node as Record<string, unknown>
    if (record.kind !== 'assistant') continue
    const provenance = record.provenance
    if (typeof provenance !== 'object' || provenance === null || Array.isArray(provenance)) continue
    const provider = (provenance as Record<string, unknown>).provider
    if (typeof provider !== 'string') continue
    const mapped = providerIdFromRoute(provider)
    if (mapped !== undefined) return mapped
  }
  return undefined
}

export function remainingPercent(remaining: number | undefined, used: number | undefined): number | undefined {
  const candidate = Number.isFinite(remaining)
    ? remaining!
    : Number.isFinite(used)
      ? 100 - used!
      : undefined
  if (candidate === undefined) return undefined
  return Math.round(Math.max(0, Math.min(100, candidate)))
}

export function formatContextWindow(value: number): string {
  if (value === 1_000_000) return '1M'
  if (value % 1_000 === 0) return `${value / 1_000}K`
  return value.toLocaleString('en-US')
}

export function isPresetContextWindow(value: number, options: readonly number[]): boolean {
  return options.includes(value)
}

export function contextControlValue(
  selected: number,
  options: readonly number[],
  customEditing: boolean,
): string {
  return customEditing || !isPresetContextWindow(selected, options)
    ? 'custom'
    : String(selected)
}
