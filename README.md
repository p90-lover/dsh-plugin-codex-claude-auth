# 模型與帳號控制中心

**繁體中文（預設）** | [English](README.en.md)

在 **DeepSeek Harness（DSH）** 裡管理 OpenAI Codex 與 Anthropic Claude 帳號：登入、查看剩餘額度、調整上下文、設定代理，以及選擇備援模型。

這是安裝在 DSH 裡的外掛，不是另一套 DSH，也不是獨立桌面程式。[DeepSeek Harness 官方專案](https://github.com/deepseek-ai/deepseek-harness)是宿主；本倉庫維護的是外掛。

[快速開始](#quickstart) · [功能操作](#features) · [切換工作環境](#handoff) · [問題排解](#troubleshooting) · [安全說明](SECURITY.md#zh) · [更新紀錄](CHANGELOG.md#zh)

> **目前文件對應開發分支的 0.9.0。** 分支上的程式碼與測試產物不等於已發佈版本。請以本倉庫 [Releases](https://github.com/p90-lover/dsh-plugin-codex-claude-auth/releases) 實際列出的檔案為準；沒有 0.9.0 安裝包時，請勿把舊包改名，改用下方的原始碼建置方式。

## 開始前，先確認版本

| 項目 | 本次適配範圍 |
| --- | --- |
| 外掛 | 本分支 `0.9.0` |
| DSH 基準版本 | `0.1.2-rc.1` |
| 另外驗證的 DSH 版本 | `0.1.3-alpha.2` |
| Node.js | `^22.19.0 \|\| >=24.0.0`；本專案 CI 使用 Node 24 |

`rc`、`alpha` 都是預發佈版本，並非穩定版。**支援上述兩個版本，不代表支援所有更新版本或任意 `master` 提交。** 升級前先看[官方更新紀錄](https://github.com/deepseek-ai/deepseek-harness/releases)。

<a id="quickstart"></a>
## 快速開始

### 1. 準備 DSH

已安裝 DSH 的使用者，先確認版本；不需要重新建立帳號或刪除會話。

```powershell
node --version
dsh --version
```

全新安裝可使用本專案的基準版本：

```powershell
npm install --global @deepseek-ai/dsh@0.1.2-rc.1
dsh web
```

DSH 會顯示本機入口並嘗試開啟瀏覽器。依首次啟動畫面操作；暫時沒有設定模型時，可選擇稍後設定。接著回到終端機，以 `Ctrl+C` 停止**這次啟動的 DSH**，再安裝外掛。

> **升級既有環境前：** 先停止執行中的任務，私下備份 DSH 設定、會話與憑證儲存區。不要把備份放進 GitHub 或交接檔。`Profile` 是一組獨立的啟動設定；下列指令都使用 `web`，安裝和啟動時必須選同一組。

### 2. 安裝外掛

到 [Releases](https://github.com/p90-lover/dsh-plugin-codex-claude-auth/releases) 查看是否已提供 `dsh-oauth-model-providers-0.9.0.tgz` 和 `SHA256SUMS`。兩者都存在時，下載至同一資料夾，並在該資料夾開啟 PowerShell：

```powershell
Get-FileHash .\dsh-oauth-model-providers-0.9.0.tgz -Algorithm SHA256
Get-Content .\SHA256SUMS
```

**先比對兩個 SHA256 值，完全一致才繼續。** 這裡的兩條指令只顯示數值，不會替你自動判定是否相符。接著執行：

```powershell
dsh plugin --profile web add .\dsh-oauth-model-providers-0.9.0.tgz
dsh web
```

macOS／Linux 可用 `shasum -a 256 dsh-oauth-model-providers-0.9.0.tgz` 比對，再把安裝指令中的 ` .\` 路徑改成 ` ./`。

<details>
<summary>尚未發佈 0.9.0？從目前開發分支建置</summary>

此方式適合能自行處理建置錯誤的使用者，需要 Git、相容的 Node.js 與 pnpm。請另開新資料夾，不要覆蓋現有 DSH 專案。

```powershell
git clone --branch feat/harness-compat-control-center --single-branch https://github.com/p90-lover/dsh-plugin-codex-claude-auth.git
cd dsh-plugin-codex-claude-auth
npm install --global pnpm@10.30.1
pnpm install --frozen-lockfile
pnpm run check
pnpm pack --pack-destination .
dsh plugin --profile web add .\dsh-oauth-model-providers-0.9.0.tgz
dsh web
```

**任何一步失敗都先停下來，不要跳過測試再安裝。** 本機建置的檔案不是官方發佈產物。此分支名稱是開發入口，不是固定版本；記錄 `git rev-parse HEAD` 的結果，方便回報及重現。

</details>

### 3. 連接帳號並開始使用

開啟 **設定 → 模型與帳號 / OAuth → 帳號與額度**。選擇 OpenAI 或 Claude，按 **連接帳號**，依畫面開啟提供者登入頁；完成授權後返回 DSH。自動返回未完成時，使用畫面提供的欄位貼回授權碼或返回網址，不要貼到聊天或 Issue。

**看到帳號卡片和登入狀態，才代表本機已保存登入資料。** 這不保證外部服務正常、仍有額度，或每個模型都能使用。請只登入你有權使用的帳號；提供者的方案、地區及使用限制仍然適用。

回到對話頁，選擇專案工作區，再選擇模型開始新任務。外掛頁右上方可切換 **繁體中文／English**；可用的瀏覽器儲存空間會記住選擇。這不會更改整個 DSH 的介面語言。

<a id="features"></a>
## 功能操作：我要做什麼？

| 你想做的事 | 到哪裡操作 | 如何確認 |
| --- | --- | --- |
| 新增或切換帳號 | 帳號與額度 | 帳號卡片標示使用中的帳號 |
| 看還能用多少 | 帳號與額度 | 查看剩餘百分比及重設時間 |
| 調整對話容量 | 上下文 | 等待儲存確認，再查看模型有效上限 |
| 讓請求走指定代理 | 代理路由 | 儲存代理後，檢查提供者／帳號指派 |
| 主要路由失敗時使用另一個模型 | 自動備援 | 明確允許目的地後才會跨提供者備援 |
| 排查問題 | 診斷 | 更新狀態，必要時匯出診斷快照 |
| 換到另一個工具繼續工作 | 工作交接 | 檢閱後匯出摘要；到目標工具建立新會話 |

### 額度：看的是「剩餘」，不是「已用」

`100% → 0%` 表示剩餘額度逐漸減少。**「暫無資料」不代表還有 100%，也不代表已用完。** Claude 分別顯示 5 小時與每週額度；OpenAI 顯示收到的限制中較嚴格的剩餘值。

輸入框旁的額度摘要跟隨目前會話選擇的提供者。用 Claude 時，不會顯示 OpenAI 的額度或上下文控制。登出前會要求確認；登出移除該提供者的本機登入，不會刪除對話，遠端授權仍需到提供者網站撤銷。

### 上下文：先登入，再選容量

在 **帳號與額度** 登入 OpenAI 後，到 **上下文** 選擇 `252K`、`353K`、`500K`、`1M` 或 **自訂**，再按 **套用上下文**。數值沒有改變時，不需要重複儲存。

`tokens` 是模型計量文字的單位，不等於中文字數。自訂要求值接受 **252,000–1,000,000 tokens**；實際可用上限仍受模型限制。例如模型原生上限為 400K，選 1M 後仍最多使用 400K。

**看到宿主確認訊息才算儲存成功。** 新設定用於後續請求，不會中途改動已開始的請求。自動壓縮由 DSH 的 Agent Preset（工作預設）管理；本外掛不另外新增壓縮服務，也不保證一律在 90% 觸發。OpenAI 遠端壓縮失敗時，交回 DSH 既有的摘要流程。

### 代理路由：先新增，再指派

輸入容易辨識的名稱及 HTTP(S) 代理網址，按 **新增代理**。儲存後，只顯示去除認證資訊的主機；接著選擇共用預設、提供者或帳號指派。

採用順序為 **有效的帳號設定 → 有效的提供者設定 → 共用預設 → DSH 原本的網路設定**。HTTP／HTTPS 可用，SOCKS／PAC 不在此功能的支援範圍。提供者登入頁使用瀏覽器自己的網路設定；正在登入時，要先取消登入才能調整代理。

### 自動備援：你決定可以把資料送到哪裡

跨提供者備援**預設關閉**；既有明確啟用的偏好會保留。在 **自動備援** 允許可信任的目的地後，再設定順序、模型與推理強度；也可使用個別帳號覆寫。

> 啟用另一家提供者，可能把對話與專案內容送到該服務。請先確認你有權分享這些資料。

恢復流程先嘗試同一提供者的另一個已存帳號，再嘗試至多一個允許的目的地。已提交輸出或工具結果後不會自動重播請求。不支援的推理強度會被拒絕，而不是假裝已套用。

「重設額度兌換」是另一個預設關閉的帳號選項；啟用代表你同意在符合條件時消耗提供者發給該帳號的重設額度。

### 診斷與程式碼審查

問題發生時先更新狀態，再查看個別提供者的錯誤。診斷快照採用固定欄位，不包含帳號標籤、完整代理網址、授權網址、憑證或對話；**分享前仍請自行檢閱**。

目前會話提供 `/review` 指令時，才可以啟動程式碼審查。成功送出表示宿主已接受審查請求，**不代表審查已完成，也不代表程式沒有安全問題**。審查中的「唯讀」文字指示不取代 DSH 的工具權限及審批政策。

<a id="handoff"></a>
## 切換模型與切換 Harness，有什麼不同？

**換模型**是在 DSH 會話內選擇另一個提供者或模型；**換 Harness** 是改用另一個工作工具，例如 Codex 或 Claude Code。兩者不是同一個功能。

目前提供的是**手動工作交接**，不是一鍵搬移正在執行的會話：

1. 停止來源任務與工具。在 **工作交接** 填寫任務目標、已完成工作、下一步，以及專案相對路徑，例如 `src/main.ts`。
2. 檢查內容沒有密鑰、私人對話或不應分享的資料，再勾選確認，按 **匯出可讀摘要**；需要結構化資料時選 JSON。
3. 在目標工具重新確認登入、工作區、模型及工具權限，建立新會話，再提供匯出的摘要。

交接檔只包含你填寫的內容，**不會讀取列出的檔案、不會搬移權杖、不會繼承權限，也不會啟動其他應用程式或重播工具**。JSON 是本外掛的交接格式，不保證可由其他工具原生匯入。不要直接共用不同工具的憑證或會話資料夾。

<a id="troubleshooting"></a>
## 問題排解

| 畫面或狀況 | 先做這件事 |
| --- | --- |
| 找不到「模型與帳號 / OAuth」 | 確認安裝和啟動都使用 `web` Profile；重啟該 Profile，並檢查版本 |
| 找不到 0.9.0 下載檔 | 該版本尚未發佈；使用前面的原始碼建置方式，不要改名舊包 |
| 上下文頁提示先登入 | 到「帳號與額度」連接 OpenAI，再返回設定 |
| 額度是空白或暫無資料 | 按「更新狀態」，查看提供者錯誤；不要把空白當作可用額度 |
| 出現 401 或登入入口失效 | 重新開啟 DSH 顯示的入口；不要關閉驗證或公開網址中的 token |
| 儲存失敗 | 保留錯誤訊息、檢查連線與輸入；不要把點過按鈕當作成功 |
| 升級後仍顯示舊介面 | 檢查同一 Profile 是否重複載入外掛，再重啟；不要刪除會話或憑證來排錯 |

只透過外掛套件載入它提供的具名項目。不要把 `lib/index.js`、`openai.js`、`anthropic.js` 另外以絕對路徑加入 Loader，否則可能重複載入瀏覽器模組。

回報一般問題時，提供 **DSH 版本、外掛版本、重現步驟、預期及實際結果**，附上已遮罩的截圖或診斷即可。安全漏洞請依[安全回報方式](SECURITY.md#report-zh)處理，不要公開憑證。

<details>
<summary>開發者：測試、相容性與交接 API</summary>

在原始碼目錄執行；瀏覽器測試另需安裝 Playwright Chromium：

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm exec playwright install --with-deps chromium
pnpm run test:browser
pnpm pack
```

`check` 執行型別檢查、迴歸測試及建置。瀏覽器測試同時使用虛構資料與獨立 DSH 臨時 Profile，不使用真實 OAuth 帳號。通過測試不等於已驗證所有提供者的真實登入、計費、額度或線上推理。

CI 分別檢查 `0.1.2-rc.1` 與 `0.1.3-alpha.2`。排程的 upstream canary 只檢查上游提交與版本變動，**不會自動建置或證明最新 master 相容**。

`dsh-oauth-model-providers/handoff` 提供 `createHandoff`、`parseHandoff`、`renderHandoff` 與 `preflightHandoff`。預檢依呼叫端提供的狀態，拒絕執行中的來源、未完成工具、未驗證登入或不支援交接的目的端。它是資料層，不會自行偵測其他程式的執行狀態，也不是跨應用程式自動遷移器。

</details>

## 官方資料與授權

DSH 的啟動方式與工作區概念，請參閱[官方使用指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md)及 [CLI 說明](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md)。官方 `master` 文件可能早於或晚於你安裝的版本。

本外掛維持 [PolyForm Noncommercial 授權](LICENSE)。DSH 上游的 MIT 授權不會改變本外掛的授權；介面改版也不代表取得商用許可。

[回到頁首](#模型與帳號控制中心) · [English](README.en.md)
