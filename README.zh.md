# DeepSeek Harness OAuth 模型提供者

這是一個實驗性的 DeepSeek Harness 組合包，會加入兩條彼此獨立的 LLM 路由：

- `openai-codex-oauth` — 以 ChatGPT 訂閱帳號登入並使用 OpenAI Codex 模型。
- `anthropic-oauth` — 以 Claude Pro/Max 帳號登入並使用 Anthropic Claude 模型。

此組合包使用 DeepSeek Harness 的命令、提問介面、模型路由與持久憑證參照服務。OAuth 登入與更新由 `@earendil-works/pi-ai` 提供；模型清單也直接取自該套件，而不是在本專案中寫死。

## 相容版本

- DeepSeek Harness `0.1.0-rc.6`（`next` 頻道）
- Node.js `22.19.0` 以上（支援 Node 24）
- `@earendil-works/pi-ai` `0.82.1`

DeepSeek Harness 目前仍是開發者預覽版。請鎖定以上版本，並預期預發佈期間的外掛 API 仍可能變更。

## 安裝

將打包檔安裝到 Web profile：

```powershell
dsh plugin --profile web add .\dsh-oauth-model-providers-0.2.4.tgz
dsh --profile web
```

若使用原始碼資料夾，先安裝相依套件並建置，再把套件目錄交給 `dsh plugin add`：

```powershell
pnpm install
pnpm run build
dsh plugin --profile web add .
```

此組合包會同時插入兩條路由，不會取代內建的 API key 提供者。

## 從設定登入並使用模型

在 Harness Web 中：

1. 開啟 **設定 → OAuth 提供者**。
2. 點選 **新增 Codex OAuth** 或 **新增 Claude OAuth**。如果尚未開啟聊天，Harness 會自動建立一個；接著設定頁會關閉，安全流程會在該聊天中繼續。
3. 依照 Harness 提問介面顯示的瀏覽器網址或裝置碼完成授權。
4. 登入成功後，提供者及其模型會自動出現在模型選擇器。

也可以直接在對話輸入框使用 `/login-openai`、`/login-claude`、`/status-openai` 與 `/status-claude`。

可以在同一個設定頁按 **中斷連線**，或執行 `/logout-openai` 與 `/logout-claude`。登出會移除本機儲存的授權資料，並從模型選擇器隱藏該提供者；它不保證撤銷遠端授權，若有需要，請在提供者帳號中另外撤銷。

## 憑證儲存

每個提供者的權杖會序列化成一份 JSON 機密，並透過 Harness 憑證服務儲存：

- OpenAI：`DSH_OPENAI_CODEX_OAUTH`
- Anthropic：`DSH_ANTHROPIC_OAUTH`

使用標準本機憑證提供者時，這些參照會儲存在 `$DSH_HOME` 下的 Harness 憑證存放區。狀態命令只會顯示登入與到期狀態，絕不顯示權杖內容。同一個 Harness 程序中的更新寫入會依序執行。

請勿把 `.credentials.yaml`、含重新導向網址的紀錄，或已登入的 Harness home 提交到版本控制。

## 設定

插入的 Cordis 列 id 為 `llm-openai-codex-oauth` 與 `llm-anthropic-oauth`。profile patch 可以取代其中任一列的設定。DeepSeek Harness 依 id 套用 patch 時會取代整份 config，因此所有想保留的非預設值都要重新列出。

```yaml
- id: llm-openai-codex-oauth
  config:
    route: openai-codex-oauth
    displayName: OpenAI Codex (OAuth)
    credentialRef: DSH_OPENAI_CODEX_OAUTH
    loginCommand: login-openai
    statusCommand: status-openai
    logoutCommand: logout-openai
    streamIdleTimeoutMs: 300000

- id: llm-anthropic-oauth
  config:
    route: anthropic-oauth
    displayName: Anthropic Claude (OAuth)
    credentialRef: DSH_ANTHROPIC_OAUTH
    loginCommand: login-claude
    statusCommand: status-claude
    logoutCommand: logout-claude
    streamIdleTimeoutMs: 300000
```

可選的傳輸控制欄位為 `transport`、`timeoutMs`、`websocketConnectTimeoutMs` 與 `retryPolicy`，其行為與 `dsh-llm-pi-ai` 相同。

## 重要限制

- 此處的 OpenAI OAuth 是 Codex/ChatGPT 訂閱路由，不能把 ChatGPT 訂閱變成任意 OpenAI API 存取權。
- 此處的 Anthropic OAuth 針對 Claude 程式開發工具所用的 Claude Pro/Max 流程，並非 Anthropic API key 路由。
- 這些消費者 OAuth 流程並未被文件化為穩定、通用的第三方整合合約；提供者政策或通訊協定變更都可能使其失效。使用前請確認適用的提供者條款；正式環境整合建議使用官方 API 憑證。
- 更新序列化只限單一程序。請勿讓多個 Harness 程序共用同一個 OAuth 憑證參照，否則輪替 refresh token 時可能跨程序競爭。
- 測試套件刻意不自動操作真實帳號登入。請在自己的 profile 內互動完成每個登入流程，並實際驗證一次模型請求。

## 開發檢查

```powershell
pnpm run typecheck
pnpm test
pnpm run build
```

聚焦測試涵蓋：不洩漏機密的憑證中繼資料、依序執行的更新操作，以及路由轉送時保留上游提供者識別。
