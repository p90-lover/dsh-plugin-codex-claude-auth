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
  'src/context-window.ts',
  `export const OPENAI_CONTEXT_WINDOW_OPTIONS = [252_000, 353_000, 500_000, 1_000_000] as const\nexport const OPENAI_AUTO_COMPACT_RATIO = 0.9`,
  `export const OPENAI_CONTEXT_WINDOW_OPTIONS = [252_000, 353_000, 500_000, 1_000_000] as const`,
)
replaceOnce(
  'src/context-window.ts',
  `  minimum: number\n  maximum: number\n  autoCompactAt: number`,
  `  minimum: number\n  maximum: number`,
)
replaceOnce(
  'src/context-window.ts',
  `      minimum: MIN_OPENAI_CONTEXT_WINDOW,\n      maximum: MAX_OPENAI_CONTEXT_WINDOW,\n      autoCompactAt: Math.floor(this.selected * OPENAI_AUTO_COMPACT_RATIO),`,
  `      minimum: MIN_OPENAI_CONTEXT_WINDOW,\n      maximum: MAX_OPENAI_CONTEXT_WINDOW,`,
)

replaceOnce(
  'src/client/provider-usage.ts',
  `export function isPresetContextWindow(value: number, options: readonly number[]): boolean {\n  return options.includes(value)\n}`,
  `export function isPresetContextWindow(value: number, options: readonly number[]): boolean {\n  return options.includes(value)\n}\n\nexport function contextControlValue(\n  selected: number,\n  options: readonly number[],\n  customEditing: boolean,\n): string {\n  return customEditing || !isPresetContextWindow(selected, options)\n    ? 'custom'\n    : String(selected)\n}`,
)

replaceOnce(
  'src/client/index.tsx',
  `  formatContextWindow,\n  isPresetContextWindow,`,
  `  contextControlValue,\n  formatContextWindow,\n  isPresetContextWindow,`,
)
replaceOnce(
  'src/client/index.tsx',
  `  contextWindowCustom: 'Custom', contextWindowRange: 'Custom range: {minimum}–{maximum}',\n  contextAutoCompact: 'Auto-compact at {tokens} (90%)',`,
  `  contextWindowCustom: 'Custom', contextWindowRange: 'Custom range: {minimum}–{maximum}',`,
)
replaceOnce(
  'src/client/index.tsx',
  `  contextWindowCustom: '自訂', contextWindowRange: '自訂範圍：{minimum}–{maximum}',\n  contextAutoCompact: '在 {tokens}（90%）自動壓縮',`,
  `  contextWindowCustom: '自訂', contextWindowRange: '自訂範圍：{minimum}–{maximum}',`,
)
replaceOnce(
  'src/client/index.tsx',
  `    minimum: number\n    maximum: number\n    autoCompactAt: number`,
  `    minimum: number\n    maximum: number`,
)
replaceOnce(
  'src/client/index.tsx',
  `  const [saving, setSaving] = useState(false)\n  const [customValue, setCustomValue] = useState('')`,
  `  const [saving, setSaving] = useState(false)\n  const [customValue, setCustomValue] = useState('')\n  const [customEditing, setCustomEditing] = useState(false)`,
)
replaceOnce(
  'src/client/index.tsx',
  `  useEffect(() => {\n    if (activeProvider === undefined) {\n      setStatus(undefined)\n      return\n    }\n    const provider = providers.find(entry => entry.id === activeProvider)`,
  `  useEffect(() => {\n    setStatus(undefined)\n    if (activeProvider === undefined) return\n    const provider = providers.find(entry => entry.id === activeProvider)`,
)
replaceOnce(
  'src/client/index.tsx',
  `  const customSelected = context !== undefined\n    && !isPresetContextWindow(context.selected, context.options)\n  useEffect(() => {\n    if (context !== undefined && customSelected) setCustomValue(String(context.selected))\n  }, [context?.selected, customSelected])`,
  `  const customSelected = context !== undefined\n    && !isPresetContextWindow(context.selected, context.options)\n  const contextSelectValue = context === undefined\n    ? ''\n    : contextControlValue(context.selected, context.options, customEditing)\n  useEffect(() => {\n    if (context === undefined) {\n      setCustomEditing(false)\n      return\n    }\n    if (customSelected) {\n      setCustomValue(String(context.selected))\n      setCustomEditing(true)\n    }\n  }, [context?.selected, customSelected])`,
)
replaceOnce(
  'src/client/index.tsx',
  `  const commitCustom = (): void => {\n    const value = Number(customValue)\n    if (Number.isInteger(value) && value !== context?.selected) setContextWindow(value)\n  }`,
  `  const commitCustom = (): void => {\n    if (context === undefined) return\n    const value = Number(customValue)\n    if (!Number.isInteger(value)\n      || value < context.minimum\n      || value > context.maximum\n      || value === context.selected) return\n    setCustomEditing(!isPresetContextWindow(value, context.options))\n    setContextWindow(value)\n  }`,
)
replaceOnce(
  'src/client/index.tsx',
  `            <label\n              style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}\n              title={t('contextAutoCompact', { tokens: formatContextWindow(context.autoCompactAt) })}\n            >`,
  `            <label\n              style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}\n              title={t('contextWindowTitle')}\n            >`,
)
replaceOnce(
  'src/client/index.tsx',
  `                value={customSelected ? 'custom' : String(context.selected)}`,
  `                value={contextSelectValue}`,
)
replaceOnce(
  'src/client/index.tsx',
  `                  if (value === 'custom') {\n                    setCustomValue(String(context.selected))\n                    return\n                  }\n                  setContextWindow(Number(value))`,
  `                  if (value === 'custom') {\n                    setCustomValue(String(context.selected))\n                    setCustomEditing(true)\n                    return\n                  }\n                  setCustomEditing(false)\n                  setContextWindow(Number(value))`,
)
replaceOnce(
  'src/client/index.tsx',
  `              {customSelected\n                ? (`,
  `              {customEditing || customSelected\n                ? (`,
)

write('cordis.patch.yml', `- insert:\n    - id: ui-oauth-model-providers\n      name: 'dsh-oauth-model-providers'\n    - id: llm-openai-codex-oauth\n      name: 'dsh-oauth-model-providers/openai'\n    - id: llm-anthropic-oauth\n      name: 'dsh-oauth-model-providers/anthropic'\n`)

replaceOnce(
  'README.md',
  `This bundle configures DSH automatic compaction at 90% of the effective model context window. For the OpenAI OAuth route, that means 226,800 tokens at 252K, 317,700 at 353K, 450,000 at 500K, 900,000 at 1M, or floor(custom × 0.9). Manual compaction remains available through DSH.\n\nWhen DSH starts either automatic or manual compaction on the OpenAI OAuth route, the plugin sends the full Responses input to OpenAI's provider-native remote compaction endpoint. Its canonical output is stored inside the DSH checkpoint and expanded back into the next request without pruning. The plugin does not launch the Codex CLI or type /compact; it uses the same OpenAI compaction service directly. If that endpoint fails, the same compaction attempt continues through DSH's local summary path.`,
  `Automatic compaction timing is owned by the active DSH agent preset. With the pinned DSH 0.1.0-rc.6 packages, \\`compaction-basic\\` defaults to 80% of the effective routed-model context unless the preset or user configuration changes \\`thresholdRatio\\`. This bundle does not mount a second compaction service.\n\nWhen DSH starts either automatic or manual compaction on the OpenAI OAuth route, the plugin sends the full Responses input to OpenAI's provider-native remote compaction endpoint. Its canonical output is stored inside the DSH checkpoint and expanded back into the next request without pruning. The plugin does not launch the Codex CLI or type /compact. If that endpoint fails, the same compaction attempt continues through DSH's local summary path.`,
)
replaceOnce(
  'README.zh.md',
  `此組合包會把 DSH 自動壓縮門檻設定為有效模型上下文視窗的 90%。OpenAI OAuth 路由在 252K、353K、500K 與 1M 時，門檻分別是 226,800、317,700、450,000 與 900,000 tokens；自訂值則使用 floor（自訂值 × 0.9）。DSH 的手動壓縮仍可照常使用。\n\n當 DSH 在 OpenAI OAuth 路由啟動自動或手動壓縮時，外掛會把完整 Responses 輸入送到 OpenAI 提供者原生的遠端壓縮端點。標準輸出會存入 DSH 檢查點，並在下一次請求原樣展開，不會自行裁剪。外掛不會啟動 Codex CLI，也不會輸入 /compact；它會直接使用與 Codex 相同的 OpenAI 壓縮服務。若該端點失敗，同一次壓縮會繼續走 DSH 本機摘要路徑。`,
  `自動壓縮的時機由目前使用中的 DSH Agent Preset 管理。使用此專案鎖定的 DSH 0.1.0-rc.6 套件時，\\`compaction-basic\\` 預設會在有效路由模型上下文的 80% 啟動；若 Preset 或使用者設定修改了 \\`thresholdRatio\\`，則以該設定為準。此組合包不會再掛載第二個壓縮服務。\n\n當 DSH 在 OpenAI OAuth 路由啟動自動或手動壓縮時，外掛會把完整 Responses 輸入送到 OpenAI 提供者原生的遠端壓縮端點。標準輸出會存入 DSH 檢查點，並在下一次請求原樣展開，不會自行裁剪。外掛不會啟動 Codex CLI，也不會輸入 /compact。若該端點失敗，同一次壓縮會繼續走 DSH 本機摘要路徑。`,
)

replaceOnce(
  'tests/context-window.spec.ts',
  `      minimum: MIN_OPENAI_CONTEXT_WINDOW,\n      maximum: MAX_OPENAI_CONTEXT_WINDOW,\n      autoCompactAt: Math.floor(DEFAULT_OPENAI_CONTEXT_WINDOW * 0.9),`,
  `      minimum: MIN_OPENAI_CONTEXT_WINDOW,\n      maximum: MAX_OPENAI_CONTEXT_WINDOW,`,
)
replaceOnce(
  'tests/context-window.spec.ts',
  `    expect(preference.status().selected).toBe(777_000)\n    expect(preference.status().autoCompactAt).toBe(699_300)`,
  `    expect(preference.status().selected).toBe(777_000)`,
)
replaceOnce(
  'tests/provider-usage.spec.ts',
  `  formatContextWindow,`,
  `  contextControlValue,\n  formatContextWindow,`,
)
replaceOnce(
  'tests/provider-usage.spec.ts',
  `  it('formats extended context presets without showing 1000K', () => {\n    expect(formatContextWindow(252_000)).toBe('252K')\n    expect(formatContextWindow(500_000)).toBe('500K')\n    expect(formatContextWindow(1_000_000)).toBe('1M')\n  })`,
  `  it('formats extended context presets without showing 1000K', () => {\n    expect(formatContextWindow(252_000)).toBe('252K')\n    expect(formatContextWindow(500_000)).toBe('500K')\n    expect(formatContextWindow(1_000_000)).toBe('1M')\n  })\n\n  it('keeps the custom editor visible after Custom is selected from a preset', () => {\n    const options = [252_000, 353_000, 500_000, 1_000_000]\n    expect(contextControlValue(252_000, options, false)).toBe('252000')\n    expect(contextControlValue(252_000, options, true)).toBe('custom')\n    expect(contextControlValue(777_000, options, false)).toBe('custom')\n  })`,
)
