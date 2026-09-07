# 更新紀錄

[繁體中文（預設）](#zh) | [English](#en) · [返回使用說明](README.md)

本頁解釋「更新後有什麼不同」及「升級前要注意什麼」。**版本是否已發佈，以 [Releases](https://github.com/p90-lover/dsh-plugin-codex-claude-auth/releases) 為準；開發分支上的版本號不代表已有下載檔。**

<a id="zh"></a>
## 繁體中文

### 0.9.0 — 開發分支，待發佈

#### 操作更集中

帳號、剩餘額度、上下文、代理路由、自動備援、診斷與工作交接，集中在「模型與帳號」控制中心。常用操作顯示進行中、成功或失敗狀態，減少只看到按鈕變化、卻不知道設定有沒有存好的情況。

README 與外掛介面預設使用繁體中文，保留 English 切換。文件新增清楚的安裝前檢查、SHA256 比對、未發佈時的建置方式、功能入口及問題排解。安全說明與本更新紀錄也提供繁體中文優先的雙語導覽；舊 `README.zh.md` 連結繼續有效。

#### 修正容易誤解或失敗的操作

額度沒有資料時，不再當作 100% 剩餘；修正 Claude 額度百分比解析。上下文設定區分要求值與模型實際上限，未登入 OpenAI 時會先解釋登入要求，而不是提供必定被拒絕的寫入操作。舊背景讀取不會覆蓋已確認的新設定。

使用 Claude 時，輸入框旁不再顯示 OpenAI 上下文控制。代理可在登入前管理，保存後只顯示去除認證資訊的網址。

#### 適配新版 DSH

以 DSH `0.1.2-rc.1` 為基準，並獨立驗證 `0.1.3-alpha.2`。適配新版會話、畫面載入、遠端服務、設定及 pi-ai 認證／模型快照介面。

這兩個 DSH 版本仍是預發佈版本。上游變動檢查只偵測提交和版本差異，不能當作「最新 master 已通過完整測試」。

#### 加強資料與操作保護

瀏覽器 API 接入 DSH 原生驗證，更新 HTTP 相依套件，限制審查檔案讀取並加強錯誤遮罩。跨提供者備援需要明確允許；已提交輸出或工具結果後不會自動重播請求，手動切換模型會使舊備援路由失效。詳細範圍與限制見[安全說明](SECURITY.md#zh)。

#### 跨工具交接的實際範圍

新增可檢閱的 Markdown／JSON 任務交接資料，以及供開發者使用的目的端預檢。**目前是手動交接，不是不同應用程式之間正在執行的原生會話自動遷移。** 不會搬移憑證、權限或啟動其他程式。

#### 升級前要做什麼？

停止目前任務，私下備份 DSH 設定、會話及憑證；確認外掛與 DSH 版本配對，再依[安裝說明](README.md#quickstart)操作。不要刪除帳號、會話，或把舊套件改名成新版本。

真實 OAuth 登入、線上推理及所有提供者額度，並不是隔離 CI 的完整驗證範圍。

### 0.8.0 — 歷史版本

原始版本針對 DSH `0.1.0-rc.6`，提供 OAuth、多帳號、代理與上下文設定。保留 Git 歷史供回溯；不要直接與本次較新的 DSH 版本混用。歷史快照名稱不會改寫當時的 `package.json` 版本或授權。

[返回使用說明](README.md) · [English](#en)

---

<a id="en"></a>
## English — changes and upgrade notes

[繁體中文](#zh) | **English** · [User guide](README.en.md)

### 0.9.0 — development branch, not yet released

#### One place for routine management

The Provider Control Center groups accounts, remaining quota, context, proxy routing, fallback, diagnostics, and task handoff. Routine actions report pending, successful, or failed operations so a visual change alone is not mistaken for a saved setting.

The README and plugin UI default to Traditional Chinese with an English option. Documentation now separates prerequisites, SHA256 verification, building an unpublished version, feature navigation, and troubleshooting. Safety notes and this changelog also provide Chinese-first bilingual navigation; existing `README.zh.md` links remain usable.

#### Clearer and more reliable operations

Missing quota is no longer presented as 100% remaining, and Claude percentage parsing is corrected. Context controls separate the requested budget from actual model capacity. Disconnected OpenAI accounts receive a sign-in explanation rather than controls that would submit refused writes. Stale background reads cannot replace confirmed settings.

The Claude composer does not display OpenAI context controls. Proxies can be managed before sign-in; saved displays remove authentication information.

#### Newer DSH integration

The baseline is DSH `0.1.2-rc.1`, with independent verification of `0.1.3-alpha.2`. Integration uses the newer session, rendering, remote-service, settings, and pi-ai authentication/model-snapshot interfaces.

Both DSH versions remain prereleases. Upstream drift detection reports commit/version changes; it is not evidence that the latest master has passed full compatibility tests.

#### Data and operation safeguards

Browser APIs use native DSH authentication. HTTP dependencies are updated, review-file reads are bounded, and error redaction is strengthened. Cross-provider fallback requires explicit opt-in. Requests are not automatically replayed after committed output or tool results, and manual model selection invalidates stale fallback routing. See [Safety](SECURITY.md#en) for scope and limitations.

#### Actual scope of cross-tool handoff

Reviewable Markdown/JSON task packets and a developer-facing destination preflight are added. **This is manual handoff, not automatic migration of a running native session between applications.** Credentials and permissions are not moved, and other applications are not launched.

#### Before upgrading

Stop active tasks and privately back up DSH configuration, sessions, and credentials. Check the plugin/DSH version pairing, then follow [Get started](README.en.md#quickstart). Do not delete accounts or sessions or rename an old package to impersonate a new version.

Real OAuth sign-in, online inference, and every provider's quota behavior are not fully covered by isolated CI.

### 0.8.0 — historical version

The original version targeted DSH `0.1.0-rc.6` and provided OAuth, multiple accounts, proxy routing, and context controls. Git history is retained for reference; do not mix it unchanged with the newer DSH versions in this update. A historical snapshot label does not rewrite its original package version or license.

[User guide](README.en.md) · [繁體中文](#zh)
