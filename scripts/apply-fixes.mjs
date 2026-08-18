import { readFileSync, writeFileSync } from 'node:fs'

function read(path) { return readFileSync(path, 'utf8') }
function write(path, content) { writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8') }
function replaceOnce(path, before, after) {
  const source = read(path)
  const count = source.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one replacement, found ${count}`)
  write(path, source.replace(before, after))
}

replaceOnce(
  'src/provider-plugin.ts',
  `      contextWindow?.value,`,
  `      () => contextWindow?.value,`,
)
replaceOnce(
  'src/provider-plugin.ts',
  `      return selected as typeof model.reasoning.defaultEffort`,
  `      return selected as typeof providerDefault`,
)
replaceOnce(
  'src/failover.ts',
  `  selectEffort: (\n    model: LlmResolvedModelInfo,\n  ) => Promise<GenerateOptions['reasoningEffort'] | undefined>`,
  `  selectEffort?: (\n    model: LlmResolvedModelInfo,\n  ) => Promise<GenerateOptions['reasoningEffort'] | undefined>`,
)
replaceOnce(
  'src/failover.ts',
  `    const selectedEffort = own === undefined\n      ? await this.preferences.effortFor(provider, effortIds, info.reasoning?.defaultEffort)\n      : await own.selectEffort(info)`,
  `    const selectedEffort = own === undefined\n      ? await this.preferences.effortFor(provider, effortIds, info.reasoning?.defaultEffort)\n      : own.selectEffort === undefined\n        ? await this.preferences.effortFor(provider, effortIds, info.reasoning?.defaultEffort)\n        : await own.selectEffort(info)`,
)
replaceOnce(
  'tests/failover-effort.spec.ts',
  `    return { configured: this.values.has(ref), source: 'memory' }`,
  `    return { configured: this.values.has(ref), writable: true, source: 'memory' }`,
)
