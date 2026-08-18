# DeepSeek Harness OAuth 模型提供者

這是一個實驗性的 DeepSeek Harness 組合包，會加入兩條彼此獨立的 LLM 路由：

- `openai-codex-oauth` — 以 ChatGPT 訂閱帳號登入並使用 OpenAI Codex 模型。
- `anthropic-oauth` — 以 Claude Pro/Max 帳號登入並使用 Anthropic Claude 模型。

此組合包使用 DeepSeek Harness 的模型路由、同來源設定精靈與持久憑證參照服務。OAuth 登入與更新由 `@earendil-works/pi-ai` 提供。登入後，外掛會取得該帳號由提供者回傳的模型清單，並保留 `pi-ai` 內建清單作為離線或失敗時的備援。

> [!WARNING]
> 透過第三方 Harness 使用提供者 OAuth 帳號可能違反該提供者的服務條款，並可能導致帳號受限、停權或終止。使用本專案的所有風險由使用者自行承擔；作者與貢獻者不對帳號處分、存取權遺失、資料遺失、費用，或任何其他直接或間接損害承擔責任。

## 相容版本

- DeepSeek Harness `0.1.0-rc.6`（`next` 頻道）
- Node.js `22.19.0` 以上（支援 Node 24）
- `@earendil-works/pi-ai` `0.82.1`

DeepSeek Harness 目前仍是開發者預覽版。請鎖定以上版本，並預期預發佈期間的外掛 API 仍可能變更。

## 安裝

將打包檔安裝到 Web profile：

```powershell
dsh plugin --profile web add .\dsh-oauth-model-providers-0.8.0.tgz
dsh --profile web
```

請使用 `dsh plugin` 安裝到 profile。不要直接在 `$DSH_HOME/profiles/web` 執行 `npm install`；npm 會自動安裝 Harness peer 套件，可能形成第二份 DSH 執行環境，並在工作階段恢復時破壞 agent scope 識別。

若使用原始碼資料夾，先安裝相依套件並建置，再把套件目錄交給 `dsh plugin add`：

```powershell
pnpm install
pnpm run build
dsh plugin --profile web add .
```

此組合包會同時插入兩條路由，不會取代內建的 API key 提供者。

## 從設定登入並使用模型

在 Harness Web 中：

1. 可先開啟 **設定 → 代理伺服器**，新增一個或多個具名 HTTP(S) 代理，並選擇每個提供者使用的代理。第一個代理是預設值；帳號建立前的新 OAuth 登入也會使用提供者選擇。
2. 開啟 **設定 → OAuth 提供者**。
3. 點選 **新增 Codex OAuth** 或 **新增 Claude OAuth**，直接在提供者卡片內完成步驟；不需要指令、聊天或 Harness 提問浮層。
4. 開啟提供者登入頁。卡片會輪詢主機端流程，並自動偵測本機 OAuth 回呼（Codex 使用 `localhost:1455`，Claude 使用 `localhost:53692`）。仍可在失敗時手動貼上返回網址或授權碼。
5. 登入成功後，提供者會出現在 **設定 → 模型**。若該帳號需要覆蓋提供者／預設代理，可回到 **設定 → 代理伺服器** 指派。

此設定區頂端可切換 English / 繁體中文；此外掛頁面預設使用英文。

舊有的 `/login-openai`、`/login-claude`、`/status-openai` 與 `/status-claude` 指令仍保留作為相容備援，但設定流程不會呼叫它們。

## 遠端壓縮與程式碼審查

此組合包會把 DSH 自動壓縮門檻設定為有效模型上下文視窗的 90%。OpenAI OAuth 路由在 252K、353K、500K 與 1M 時，門檻分別是 226,800、317,700、450,000 與 900,000 tokens；自訂值則使用 floor（自訂值 × 0.9）。DSH 的手動壓縮仍可照常使用。

當 DSH 在 OpenAI OAuth 路由啟動自動或手動壓縮時，外掛會把完整 Responses 輸入送到 OpenAI 提供者原生的遠端壓縮端點。標準輸出會存入 DSH 檢查點，並在下一次請求原樣展開，不會自行裁剪。外掛不會啟動 Codex CLI，也不會輸入 /compact；它會直接使用與 Codex 相同的 OpenAI 壓縮服務。若該端點失敗，同一次壓縮會繼續走 DSH 本機摘要路徑。

按輸入框中的 **程式碼審查**，即可唯讀審查已暫存、未暫存及未追蹤變更，不會修改檔案。等效指令如下：

```text
/review
/review base main
/review commit HEAD~1
/review custom 僅檢查安全性與資料遺失問題
```

**自動審查**預設關閉；使用者自行開啟後，選擇會由瀏覽器記住。新的 OpenAI Codex 回合完成後，只有工作樹指紋尚未審查時才會啟動；乾淨工作樹、未變更的差異、Claude 回合及審查本身的回合都會略過。審查會排入一個專用模型回合。P0-P3 發現，或 `No actionable findings.`，會永久保留在聊天記錄中。

## 用量、上下文視窗與自動切換

一般 DSH 輸入框旁的精簡方塊會跟隨該工作階段目前選擇的模型。OpenAI 工作階段只顯示 OpenAI 剩餘額度與上下文控制；Claude 工作階段只顯示 Claude 的 5 小時及每週剩餘額度。額度重設後由 100% 開始，隨使用量下降，耗盡時顯示 0%；滑鼠停留時仍可查看重設詳情。

OpenAI 預設為 `252K`，並提供 `353K`、`500K`、`1M`，以及 252,000 至 1,000,000 tokens 之間的自訂整數。選擇會儲存在憑證服務管理的設定。儲存後，客戶端會重新載入目前工作階段的模型目錄，使下一個提示直接使用新發布的上下文資料，不需要重新整理瀏覽器或重啟 DSH。此方塊使用 DSH 輸入插槽，不會取代或接管文字輸入區。

開啟 **設定 → 自動切換**，即可查看 DSH 目前已註冊或宣告為可設定的所有提供者。使用者可選擇允許使用的提供者、排列順序，以及每個提供者的備援模型與該模型實際公開的推理強度。未指定模型時，若可辨識語意上的中階模型，外掛會優先選擇它（例如 Sonnet、Terra、Balanced、Standard 或 Chat）；否則使用模型清單中間項目。未指定推理強度時會使用目的模型本身的預設值。每個 OAuth 帳號都可分別覆蓋提供者的模型及推理強度，也可選擇繼承。

自動切換刻意限制為固定流程：

1. 遇到可重試、且尚未輸出內容的提供者錯誤時，若有其他 OAuth 帳號，先切換帳號重試。
2. 該帳號仍失敗時，改用第一個已啟用的其他提供者，並套用帳號／提供者設定的模型。
3. 第二個提供者仍失敗時就結束回合，不會無限逐一嘗試所有提供者。

帳號與提供者切換會以中英雙語永久寫入聊天。該工作階段後續回合會固定使用已成功的備援路由，即使原始模型選擇器仍保持不變。重新導向前會移除外來重播狀態與來源模型預設，再解析目的模型自己的推理／輸出預設，避免提供者／模型重播不一致。只有在模型尚未輸出時才會自動切換；已部分輸出的回答或工具呼叫絕不會重播。

## DSH 內的 Codex 工具呼叫

OpenAI OAuth 路由使用 DSH 原有的工具執行環境。DSH 函式結構會傳入 Codex Responses 請求；串流工具呼叫會保留名稱、參數與 `call_id`；DSH 執行工具後，相關聯的結果及重播中繼資料會在下一個模型步驟送回。路由包裝器會把持久提供者識別統一成 `openai-codex-oauth`，避免先前上游／公開提供者不一致所造成的 `INVALID_REPLAY_STATE`。

可以在同一個設定頁按 **中斷連線**，或執行 `/logout-openai` 與 `/logout-claude`。登出會移除本機儲存的授權資料，並從模型選擇器隱藏該提供者；它不保證撤銷遠端授權，若有需要，請在提供者帳號中另外撤銷。

## 憑證儲存

每個提供者的權杖會序列化成一份 JSON 機密，並透過 Harness 憑證服務儲存：

- OpenAI：`DSH_OPENAI_CODEX_OAUTH`
- Anthropic：`DSH_ANTHROPIC_OAUTH`
- OpenAI 代理：`DSH_OPENAI_CODEX_PROXY`
- Anthropic 代理：`DSH_ANTHROPIC_PROXY`
- 可重用代理清單：`DSH_OAUTH_SHARED_PROXY`
- 自動切換順序／提供者預設：`DSH_OAUTH_FAILOVER_CONFIG`

使用標準本機憑證提供者時，這些參照會儲存在 `$DSH_HOME` 下的 Harness 憑證存放區。狀態命令只會顯示登入與到期狀態，絕不顯示權杖內容。同一個 Harness 程序中的更新寫入會依序執行。

請勿把 `.credentials.yaml`、含重新導向網址或代理網址的紀錄，以及已登入的 Harness home 提交到版本控制。OAuth 回呼網址含有短效授權碼，應視為機密。

## 代理行為

可重用清單中的第一個代理是預設值。提供者指派會覆蓋登入與未個別指派帳號的預設值；帳號指派則會再覆蓋前兩者。選定的 HTTP 或 HTTPS 正向代理會透過非同步範圍隔離的 fetch dispatcher，套用到 OAuth 權杖交換／更新、用量／模型清單檢查及模型請求。選定代理後，模型傳輸會強制使用 SSE，確保請求維持在 HTTP 代理路徑。SOCKS 與 PAC 網址會被拒絕。

設定頁只能寫入代理網址。公開狀態只包含代理 ID、自訂名稱、遮蔽後主機及提供者／帳號指派。移除正在使用的代理時，路由會安全地退回目前清單中的第一個代理。

外部登入網站是由瀏覽器開啟，因此該頁面仍使用瀏覽器本身的代理／網路設定。外掛代理只涵蓋 DSH 主機流量，不會暗中變更瀏覽器或 Windows 設定。

## 自動取得模型清單

OpenAI Codex 會讀取已驗證的 ChatGPT Codex 模型清單；Anthropic 會讀取已驗證的 Models API，並在回應提供時套用能力與 token 上限資料。清單與用量請求會使用和 OAuth、模型推論相同的有效提供者／帳號代理。

若遠端清單無法連線、逾時或回應無效，外掛會保留最後已知的清單；全新啟動時則使用 `pi-ai` 內建模型。模型清單更新失敗不會移除已連線的提供者。

## 設定

插入的 Cordis 列 id 為 `llm-openai-codex-oauth` 與 `llm-anthropic-oauth`。profile patch 可以取代其中任一列的設定。DeepSeek Harness 依 id 套用 patch 時會取代整份 config，因此所有想保留的非預設值都要重新列出。請從 [`config/examples/oauth-providers.example.yml`](config/examples/oauth-providers.example.yml) 開始設定。

執行階段設定刻意與原始碼版本控制分開。請將本機覆寫放在 `config/runtime/`，或命名為 `config/*.local.yml`；兩者都已忽略。OAuth 憑證、代理網址、已填入資料的 profile 與回呼網址必須只留在 Harness 的憑證／profile 儲存區，絕對不可複製進此儲存庫。已追蹤的 `cordis.patch.yml` 只是 DSH 打包所需且不含機密的組合清單。

可選的傳輸控制欄位為 `transport`、`timeoutMs`、`websocketConnectTimeoutMs` 與 `retryPolicy`，其行為與 `dsh-llm-pi-ai` 相同。

## 重要限制

- 此處的 OpenAI OAuth 是 Codex/ChatGPT 訂閱路由，不能把 ChatGPT 訂閱變成任意 OpenAI API 存取權。
- 此處的 Anthropic OAuth 針對 Claude 程式開發工具所用的 Claude Pro/Max 流程，並非 Anthropic API key 路由。
- 這些消費者 OAuth 流程並未被文件化為穩定、通用的第三方整合合約；提供者政策或通訊協定變更都可能使其失效。使用前請確認適用的提供者條款；正式環境整合建議使用官方 API 憑證。
- 更新序列化只限單一程序。請勿讓多個 Harness 程序共用同一個 OAuth 憑證參照，否則輪替 refresh token 時可能跨程序競爭。
- 遠端模型清單是提供者回傳的建議資料；無法完成更新時，仍會保留內建清單作為安全備援。
- 測試套件刻意不自動操作真實帳號登入。請在自己的 profile 內互動完成每個登入流程，並實際驗證一次模型請求。
- 代理設定檢查成功不等於模型請求已完成；OAuth 成功後仍應驗證一次真實模型請求。

## 開發檢查

```powershell
pnpm run typecheck
pnpm test
pnpm run build
```

聚焦測試涵蓋：遠端壓縮請求與還原行為、自動及手動唯讀審查合約、Codex 工具定義／呼叫／結果識別、不洩漏機密的憑證中繼資料、依序執行的更新操作、重播路由相容性、已驗證模型清單的解析與備援、已儲存憑證的回呼狀態校正、可重用代理移轉／預設值／指派優先順序、代理網址遮蔽、代理串流選項、上下文視窗持久化，以及有界限的「先帳號、後提供者」自動切換。

## 授權條款

任何人都可以下載原始碼，並依 [PolyForm Noncommercial License 1.0.0](LICENSE) 在允許的非商業範圍內使用、研究、修改及重新散布。商業用途或預期將用於商業的用途，必須另外向著作權持有人取得商業授權。本專案不套用 MIT，因為 MIT 授權允許商業使用。PolyForm Noncommercial 屬於 source-available，而不是 OSI 認可的開放原始碼授權。
