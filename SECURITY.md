# 安全說明

[繁體中文（預設）](#zh) | [English](#en) · [返回使用說明](README.md)

<a id="zh"></a>
## 繁體中文

### 使用前，先知道這三件事

**本外掛不是沙箱，也未經獨立第三方安全稽核。** 自動化工具實際能做什麼，取決於 DSH 的工作預設及審批政策。程式碼審查中的「唯讀」文字，不能代替真正的權限限制。

**備援可能把工作內容送到另一家提供者。** 只允許你信任、且獲准接收該資料的目的地。只使用你有權使用的帳號，並遵守提供者條件。

**登入網址、權杖和代理密碼都應視為秘密。** 不要放入 GitHub、公開截圖、問題回報或工作交接檔。分享任何輸出前，都請再檢查一次。

### 哪些資料會被保存或顯示？

| 資料 | 處理方式 |
| --- | --- |
| OAuth 登入資料 | 使用本機 DSH 憑證服務；不在瀏覽器狀態回應中傳回秘密 |
| 帳號卡片 | 顯示操作需要的帳號中繼資料，例如標籤與使用狀態；截圖仍可能包含私人資訊 |
| 代理網址 | 網址可寫入設定；介面顯示時移除認證資訊。遮罩顯示不代表儲存內容已加密 |
| 診斷下載 | 使用固定欄位；排除憑證、完整代理網址、授權網址、帳號標籤及對話 |
| 工作交接 | 只匯出你填寫的任務資料；不讀取列出的檔案，不搬移登入或工具權限 |

交接的秘密字串檢查、錯誤訊息遮罩與診斷欄位限制只能降低風險，**不能保證任意輸入都沒有秘密**。這些措施也不會保護你另外手動貼上的文字或上傳的附件。

### 0.9.0 開發分支加強了什麼？

瀏覽器請求會先交由 DSH 原生驗證檢查，再讀取憑證。寫入仍要求 JSON 與同源檢查；請求本文限制為 16 KiB，回應要求不快取，並禁止瀏覽器猜測內容類型。

額度查詢使用固定 HTTPS 目的地、逾時限制，並拒絕重新導向。未知額度不會被當作 100% 可用。錯誤訊息會遮罩常見權杖、OAuth 網址參數、含憑證的 JSON 欄位、代理認證資訊及 JWT 形式的字串。

跨提供者備援預設關閉；已提交輸出或工具結果後不自動重播。手動選擇模型會使舊的暫存備援路由失效。審查未追蹤檔案時，會檢查工作區範圍、排除符號連結和非一般檔案，並限制讀取大小；可用時使用禁止跟隨符號連結的開檔方式。

HTTP 用戶端 Undici 從 `7.28.0` 更新至 `7.29.0`。相依套件掃描的範圍是**本外掛的執行期相依套件**，不涵蓋你另外安裝的全部 DSH、編輯器或其他外掛；掃描沒有已知漏洞，也不等於不存在漏洞。

### 仍然有哪些限制？

代理路由使用行程層級的 `fetch` 包裝及 `AsyncLocalStorage` 來區分提供者範圍；範圍外會交回原本的 DSH 網路處理。**不要把互不信任的外掛或租戶放在同一個行程，並期待此功能提供安全隔離。** 更新傳輸程式碼後，請重啟 Profile。

為避免破壞現有帳號，保留原有多帳號憑證格式，並銜接新版 pi-ai 認證注入。這不是已全面改成 DSH 原生 authorization-record 格式的遷移。

CI 不使用真實 OAuth 帳號，因此無法全面驗證真實登入、提供者額度、地區可用性或未來 API 變動。工作交接的確認勾選是使用者聲明；外掛不會自行停止其他應用程式或替你確認目標端的登入與權限。

<a id="report-zh"></a>
### 發現漏洞或不小心公開了秘密，怎麼辦？

1. **先撤銷或輪替已曝光的秘密。** 到提供者或代理服務撤銷相關權杖、密碼或授權。單純刪除貼文、檔案或 Git 提交，不能讓已複製的秘密失效。
2. **不要在公開 Issue 貼漏洞利用細節或可用憑證。** 本倉庫啟用 GitHub 私密漏洞回報時，使用該功能；未啟用時，只發送不含敏感資訊的聯絡請求，安排私下提供細節。
3. **準備可重現、但已去除敏感資訊的資料。** 提供 DSH／外掛版本、作業系統、影響範圍、重現步驟，以及遮罩後的錯誤訊息。不要附登入網址、憑證檔、完整私人對話或代理密碼。

不要為了「讓它能用」而關閉驗證、放寬工具權限，或把憑證複製到另一個 Harness。

[返回使用說明](README.md) · [English](#en)

---

<a id="en"></a>
## English — safety and reporting

[繁體中文](#zh) | **English** · [User guide](README.en.md)

### Three things to know before use

**This plugin is not a sandbox and has not received an independent third-party security audit.** Actual tool access is controlled by the DSH preset and approval policy. A read-only instruction in a code review is not an enforced permission boundary.

**Fallback can send work to another provider.** Enable only trusted destinations authorized to receive the data. Use only accounts you are authorized to access and follow provider conditions.

**Treat login URLs, tokens, and proxy passwords as secrets.** Keep them out of GitHub, public screenshots, reports, and handoff files. Check all output again before sharing.

### What is stored or displayed?

| Data | Handling |
| --- | --- |
| OAuth credentials | Stored through the local DSH credential service; secrets are not returned in browser status responses |
| Account cards | Show operational metadata such as labels and active state; screenshots can still contain private information |
| Proxy URLs | Accepted as settings input; authentication information is removed from the displayed value. Redaction does not establish encryption at rest |
| Diagnostic downloads | Use fixed fields; exclude credentials, full proxy URLs, authorization URLs, account labels, and conversations |
| Task handoffs | Export only task data you enter; referenced files are not read and credentials or tool permissions are not migrated |

Secret-pattern checks, error redaction, and diagnostic field restrictions reduce risk but **cannot prove arbitrary text is secret-free**. They do not protect additional text or attachments you manually include in a report.

### What the 0.9.0 development branch hardens

Browser requests pass the host's native authentication check before credential access. Writes still require JSON and same-origin validation. Request bodies are bounded to 16 KiB; responses carry no-store and nosniff protections.

Quota requests use fixed HTTPS destinations, timeouts, and redirect refusal. Unknown quota is not treated as 100% available. Error redaction covers common tokens, OAuth query parameters, credential-shaped JSON fields, proxy userinfo, and JWT-shaped strings.

Cross-provider fallback defaults to off and does not replay after committed output or tool results. Manual model selection invalidates a stale sticky fallback route. Untracked-file review checks workspace containment, skips symlinks and non-regular files, bounds reads, and uses no-follow opens where available.

Undici is updated from `7.28.0` to `7.29.0`. Dependency auditing covers **this plugin's production dependency graph**, not every dependency in a separately installed Harness, editor, or plugin. No known findings is not proof that vulnerabilities do not exist.

### Remaining boundaries

Proxy routing uses a process-level `fetch` wrapper and `AsyncLocalStorage` to scope provider requests; requests outside that scope delegate to the original DSH networking. **Do not run mutually untrusted plugins or tenants in one process and expect this feature to isolate them.** Restart the profile after transport updates.

The existing multi-account credential format is retained to avoid destructive migration and bridged into the newer pi-ai authentication injection. It has not been wholly converted to DSH's native authorization-record format.

CI does not use live OAuth accounts and cannot fully validate real sign-in, provider limits, regional availability, or future API changes. The handoff confirmation checkbox is a user declaration: the plugin does not stop other applications or independently verify destination authentication and permissions.

<a id="report-en"></a>
### Reporting a vulnerability or exposed secret

1. **Revoke or rotate exposed secrets first.** Use the provider or proxy service to revoke relevant tokens, passwords, or authorizations. Deleting a post, file, or commit does not invalidate copies already obtained by others.
2. **Do not publish exploit details or usable credentials in an issue.** Use GitHub private vulnerability reporting when enabled for this repository. Otherwise, post only a non-sensitive contact request to arrange private disclosure.
3. **Prepare reproducible, sanitized evidence.** Include DSH/plugin versions, operating system, impact, reproduction steps, and redacted errors. Exclude login URLs, credential files, complete private conversations, and proxy passwords.

Never disable authentication, weaken tool permissions, or copy credentials into another harness as a compatibility workaround.

[User guide](README.en.md) · [繁體中文](#zh)
