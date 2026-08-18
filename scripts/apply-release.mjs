import { readFileSync, writeFileSync } from 'node:fs'

function read(path) { return readFileSync(path, 'utf8') }
function write(path, content) { writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8') }
function replaceOnce(path, before, after) {
  const source = read(path)
  const count = source.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one replacement, found ${count}`)
  write(path, source.replace(before, after))
}
function cleanMarkdown(path) {
  const cleaned = read(path)
    .normalize('NFC')
    .replace(/\uFFFD/gu, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
  write(path, cleaned)
}

replaceOnce('package.json', `  "version": "0.7.4",`, `  "version": "0.8.0",`)
replaceOnce('package.json', `        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-settings",`, `        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-model-selection",
        "@deepseek-ai/dsh-client-ui-settings",`)
replaceOnce('package.json', `    "@deepseek-ai/dsh-client-ui-conversation": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-primitives":`, `    "@deepseek-ai/dsh-client-ui-conversation": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-model-selection": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-primitives":`)
replaceOnce('package.json', `    "@deepseek-ai/dsh-client-ui-conversation": {
      "optional": true
    },
    "@deepseek-ai/dsh-client-ui-primitives":`, `    "@deepseek-ai/dsh-client-ui-conversation": {
      "optional": true
    },
    "@deepseek-ai/dsh-client-ui-model-selection": {
      "optional": true
    },
    "@deepseek-ai/dsh-client-ui-primitives":`)
replaceOnce('package.json', `    "@deepseek-ai/dsh-client-ui-conversation": "0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-primitives":`, `    "@deepseek-ai/dsh-client-ui-conversation": "0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-model-selection": "0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-primitives":`)

write('cordis.patch.yml', `- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
  config:
    thresholdRatio: 0.9
- insert:
    - id: ui-oauth-model-providers
      name: 'dsh-oauth-model-providers'
    - id: llm-openai-codex-oauth
      name: 'dsh-oauth-model-providers/openai'
    - id: llm-anthropic-oauth
      name: 'dsh-oauth-model-providers/anthropic'
`)

replaceOnce('README.md', `dsh plugin --profile web add .\\dsh-oauth-model-providers-0.7.4.tgz`, `dsh plugin --profile web add .\\dsh-oauth-model-providers-0.8.0.tgz`)
replaceOnce('README.md', `When DSH's existing automatic or manual compaction selects the OpenAI OAuth route, the plugin sends the full Responses input to OpenAI's remote compaction endpoint. Its canonical output is stored inside the DSH checkpoint and expanded back into the next request without pruning. If the endpoint fails, the same compaction attempt continues through DSH's existing local summary path.`, `This bundle configures DSH automatic compaction at 90% of the effective model context window. For the OpenAI OAuth route, that means 226,800 tokens at 252K, 317,700 at 353K, 450,000 at 500K, 900,000 at 1M, or floor(custom × 0.9). Manual compaction remains available through DSH.

When DSH starts either automatic or manual compaction on the OpenAI OAuth route, the plugin sends the full Responses input to OpenAI's provider-native remote compaction endpoint. Its canonical output is stored inside the DSH checkpoint and expanded back into the next request without pruning. The plugin does not launch the Codex CLI or type /compact; it uses the same OpenAI compaction service directly. If that endpoint fails, the same compaction attempt continues through DSH's local summary path.`)
replaceOnce('README.md', `A compact box beside the normal DSH composer shows the active OpenAI usage percentage, Claude 5-hour/weekly percentages, reset details on hover, and the OpenAI context-window selector. OpenAI defaults to \`252K\`; \`353K\` can be selected and is remembered in the credential-backed provider configuration. The box uses a DSH input slot and does not replace or take ownership of the text area.`, `A compact box beside the normal DSH composer follows the model selected for that session. An OpenAI session shows only OpenAI remaining quota and its context controls; a Claude session shows only Claude 5-hour and weekly remaining quota. Percentages begin at 100% after a reset and count down to 0% when exhausted. Reset details remain available on hover.

OpenAI defaults to \`252K\` and offers \`353K\`, \`500K\`, \`1M\`, and a custom integer from 252,000 through 1,000,000 tokens. The selection is credential-backed. After a save, the client reloads the active session's model directory so the next prompt uses newly published context metadata without requiring a browser or DSH restart. The box uses a DSH input slot and does not replace or take ownership of the text area.`)
replaceOnce('README.md', `Open **Settings → Failover** to see every provider DSH currently registers or declares as configurable. Choose which available providers may be used, set their order, and select a provider-level fallback model. With no explicit model, the plugin chooses a semantic middle tier when one is identifiable (for example Sonnet, Terra, Balanced, Standard, or Chat), otherwise the middle catalog entry. Each OAuth account can override that provider default or inherit it.`, `Open **Settings → Failover** to see every provider DSH currently registers or declares as configurable. Choose which available providers may be used, set their order, and select both a provider-level fallback model and one of that exact model's advertised reasoning-effort levels. With no explicit model, the plugin chooses a semantic middle tier when one is identifiable (for example Sonnet, Terra, Balanced, Standard, or Chat), otherwise the middle catalog entry. With no explicit effort, it uses the destination model's own default. Each OAuth account can override the provider model and effort independently or inherit them.`)
replaceOnce('README.md', `context-window persistence, and bounded account-first/provider-second failover.`, `custom 252K–1M context-window persistence and live directory refresh, active-provider-only remaining-quota helpers, configurable failover effort, and bounded account-first/provider-second failover.`)

replaceOnce('README.zh.md', `dsh plugin --profile web add .\\dsh-oauth-model-providers-0.7.4.tgz`, `dsh plugin --profile web add .\\dsh-oauth-model-providers-0.8.0.tgz`)
replaceOnce('README.zh.md', `當 DSH 現有的自動或手動壓縮使用 OpenAI OAuth 路由時，外掛會把完整 Responses 輸入送到 OpenAI 遠端壓縮端點。回傳的標準輸出會存入 DSH 檢查點，並在下一次請求原樣展開，不會自行裁剪。若端點失敗，同一次壓縮會繼續走 DSH 原有的本機摘要路徑。`, `此組合包會把 DSH 自動壓縮門檻設定為有效模型上下文視窗的 90%。OpenAI OAuth 路由在 252K、353K、500K 與 1M 時，門檻分別是 226,800、317,700、450,000 與 900,000 tokens；自訂值則使用 floor（自訂值 × 0.9）。DSH 的手動壓縮仍可照常使用。

當 DSH 在 OpenAI OAuth 路由啟動自動或手動壓縮時，外掛會把完整 Responses 輸入送到 OpenAI 提供者原生的遠端壓縮端點。標準輸出會存入 DSH 檢查點，並在下一次請求原樣展開，不會自行裁剪。外掛不會啟動 Codex CLI，也不會輸入 /compact；它會直接使用與 Codex 相同的 OpenAI 壓縮服務。若該端點失敗，同一次壓縮會繼續走 DSH 本機摘要路徑。`)
replaceOnce('README.zh.md', `一般 DSH 輸入框旁會顯示一個精簡方塊，包含目前 OpenAI 用量百分比、Claude 5 小時／每週百分比、滑鼠停留時的重設詳情，以及 OpenAI 上下文視窗選擇器。OpenAI 預設為 \`252K\`，可改選 \`353K\`，並儲存在由憑證服務管理的提供者設定。此方塊使用 DSH 輸入插槽，不會取代或接管文字輸入區。`, `一般 DSH 輸入框旁的精簡方塊會跟隨該工作階段目前選擇的模型。OpenAI 工作階段只顯示 OpenAI 剩餘額度與上下文控制；Claude 工作階段只顯示 Claude 的 5 小時及每週剩餘額度。額度重設後由 100% 開始，隨使用量下降，耗盡時顯示 0%；滑鼠停留時仍可查看重設詳情。

OpenAI 預設為 \`252K\`，並提供 \`353K\`、\`500K\`、\`1M\`，以及 252,000 至 1,000,000 tokens 之間的自訂整數。選擇會儲存在憑證服務管理的設定。儲存後，客戶端會重新載入目前工作階段的模型目錄，使下一個提示直接使用新發布的上下文資料，不需要重新整理瀏覽器或重啟 DSH。此方塊使用 DSH 輸入插槽，不會取代或接管文字輸入區。`)
replaceOnce('README.zh.md', `開啟 **設定 → 自動切換**，即可查看 DSH 目前已註冊或宣告為可設定的所有提供者。使用者可選擇允許使用的提供者、排列順序，以及每個提供者的備援模型。未指定模型時，若可辨識語意上的中階模型，外掛會優先選擇它（例如 Sonnet、Terra、Balanced、Standard 或 Chat）；否則使用模型清單中間項目。每個 OAuth 帳號可覆蓋提供者預設，也可選擇繼承。`, `開啟 **設定 → 自動切換**，即可查看 DSH 目前已註冊或宣告為可設定的所有提供者。使用者可選擇允許使用的提供者、排列順序，以及每個提供者的備援模型與該模型實際公開的推理強度。未指定模型時，若可辨識語意上的中階模型，外掛會優先選擇它（例如 Sonnet、Terra、Balanced、Standard 或 Chat）；否則使用模型清單中間項目。未指定推理強度時會使用目的模型本身的預設值。每個 OAuth 帳號都可分別覆蓋提供者的模型及推理強度，也可選擇繼承。`)

cleanMarkdown('README.md')
cleanMarkdown('README.zh.md')
