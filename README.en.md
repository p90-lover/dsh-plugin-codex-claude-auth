# Provider Control Center

[繁體中文（預設）](README.md) | **English**

Manage **OpenAI Codex and Anthropic Claude accounts inside DeepSeek Harness (DSH)**: sign in, check remaining quota, adjust context limits, configure proxies, and choose fallback models.

This is a DSH plugin, not a separate Harness installation or a standalone desktop application. [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is the upstream host; this repository maintains the plugin.

[Get started](#quickstart) · [Use each feature](#features) · [Switch work environments](#handoff) · [Troubleshooting](#troubleshooting) · [Safety](SECURITY.md#en) · [Changelog](CHANGELOG.md#en)

> **These instructions describe 0.9.0 on the development branch.** Branch code and CI artifacts are not published releases. Check the files actually available in this repository's [Releases](https://github.com/p90-lover/dsh-plugin-codex-claude-auth/releases). When a 0.9.0 package is unavailable, use the source-build instructions below; do not rename an older package.

## Check compatibility first

| Component | Scope of this update |
| --- | --- |
| Plugin | `0.9.0` on this branch |
| Baseline DSH | `0.1.2-rc.1` |
| Separately verified DSH | `0.1.3-alpha.2` |
| Node.js | `^22.19.0 \|\| >=24.0.0`; this project's CI uses Node 24 |

Both `rc` and `alpha` versions are prereleases, not stable releases. **Support for these two versions does not establish support for every newer version or arbitrary `master` commit.** Read the [official release notes](https://github.com/deepseek-ai/deepseek-harness/releases) before upgrading.

<a id="quickstart"></a>
## Get started

### 1. Prepare DSH

For an existing installation, check versions first. You do not need to recreate accounts or delete conversations.

```powershell
node --version
dsh --version
```

For a new installation, use this project's baseline:

```powershell
npm install --global @deepseek-ai/dsh@0.1.2-rc.1
dsh web
```

DSH prints a local entry URL and attempts to open a browser. Follow its first-run screens; choose to configure models later when needed. Return to the terminal and use `Ctrl+C` to stop **the DSH instance you just started** before installing the plugin.

> **Before upgrading an existing environment:** stop active tasks and privately back up DSH configuration, sessions, and credential storage. Keep backups out of GitHub and handoff files. A **profile** is a separate set of launch settings. These commands consistently use `web`; install into the same profile that you launch.

### 2. Install the plugin

Check [Releases](https://github.com/p90-lover/dsh-plugin-codex-claude-auth/releases) for both `dsh-oauth-model-providers-0.9.0.tgz` and `SHA256SUMS`. When both are available, download them into the same folder and open PowerShell there:

```powershell
Get-FileHash .\dsh-oauth-model-providers-0.9.0.tgz -Algorithm SHA256
Get-Content .\SHA256SUMS
```

**Compare the two SHA256 values before continuing.** These commands display the values; they do not automatically decide whether they match. If they match exactly, run:

```powershell
dsh plugin --profile web add .\dsh-oauth-model-providers-0.9.0.tgz
dsh web
```

On macOS/Linux, compare the output of `shasum -a 256 dsh-oauth-model-providers-0.9.0.tgz`, then replace the install command's ` .\` path prefix with ` ./`.

<details>
<summary>No published 0.9.0 package? Build the development branch</summary>

This path is for users comfortable diagnosing build failures. You need Git, a compatible Node.js version, and pnpm. Use a new folder; do not overwrite an existing DSH checkout.

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

**Stop if any step fails; do not skip tests to proceed with installation.** A locally built package is not a published release artifact. The branch name is a development entry point, not an immutable version. Record `git rev-parse HEAD` for reproducible reports.

</details>

### 3. Connect an account and start a task

Open **Settings → 模型與帳號 / OAuth → 帳號與額度**. The plugin starts in Traditional Chinese; select **English** at the top right to see **Accounts & quota** and the other English labels. Choose OpenAI or Claude, select **Connect account**, and follow the provider's browser authorization. Return to DSH when finished. When the automatic return does not complete, use the displayed field for the authorization code or return URL—not a chat message or public issue.

**An account card and signed-in status confirm locally saved authentication.** They do not guarantee remote service health, remaining quota, or access to every model. Connect only accounts you are authorized to use. Provider plan, region, and usage restrictions still apply.

Return to the conversation page, choose a project workspace, and select a model for your task. The plugin's **繁體中文／English** switch remembers the choice when browser storage is available. It does not change the language of the entire DSH interface.

<a id="features"></a>
## Use each feature

| What you need | Where to go | What to check |
| --- | --- | --- |
| Add or switch accounts | Accounts & quota | The account card identifies the active account |
| Check remaining allowance | Accounts & quota | Remaining percentages and reset times |
| Adjust conversation capacity | Context | Save acknowledgement, then effective model limits |
| Route requests through a proxy | Proxy routing | Saved proxy and provider/account assignments |
| Use another model when a route fails | Fallback | Explicitly allowed destination, model, and reasoning effort |
| Diagnose a problem | Diagnostics | Refreshed status and, when needed, a diagnostic download |
| Continue work in another tool | Task handoff | Reviewed summary exported for a new destination session |

### Quota means remaining, not used

`100% → 0%` means the remaining allowance is decreasing. **Unavailable does not mean either 100% remaining or exhausted.** Claude shows five-hour and weekly limits separately. OpenAI shows the more restrictive remaining value among the limits returned.

The summary beside the composer follows the current session's provider. Claude does not show OpenAI quota or OpenAI context controls. Signing out requires confirmation and removes that provider's local sign-ins, not conversations. Revoke remote authorization separately on the provider website.

### Context: sign in before changing the budget

Sign in to OpenAI under **Accounts & quota**, then open **Context**, choose `252K`, `353K`, `500K`, `1M`, or **Custom**, and select **Apply context**. An unchanged value does not need another save.

Tokens are the model's units for measuring text, not a direct count of words or Chinese characters. Requested custom limits accept **252,000–1,000,000 tokens**. Actual capacity remains bounded by the model: choosing 1M for a 400K model still yields at most 400K.

**Wait for the host confirmation before treating a save as successful.** Changes affect subsequent requests, not requests already in progress. Automatic compaction belongs to the DSH agent preset. The plugin does not add a second compaction service or guarantee a universal 90% trigger. Failed OpenAI remote compaction returns to DSH's existing summarization path.

### Proxy routing: save, then assign

Enter a recognizable name and an HTTP(S) proxy URL, then select **Add proxy**. The saved display removes authentication information. Choose a shared default, provider assignment, or account assignment next.

Precedence is **valid account override → valid provider override → shared default → existing DSH networking**. HTTP/HTTPS proxies are supported; SOCKS/PAC are outside this feature's scope. Provider sign-in pages use the browser's own networking. Cancel an active sign-in before changing its proxy.

### Fallback: decide where your data may go

Cross-provider fallback is **off by default**; previously enabled preferences are retained. Under **Fallback**, allow a trusted destination, then set its order, model, and reasoning effort. Account-specific overrides are also available.

> Enabling another provider can send conversation and project content to that service. Check that you have permission to share it.

Recovery tries another saved account for the same provider before at most one permitted destination. It does not automatically replay requests after committed output or tool results. Unsupported reasoning effort is rejected rather than presented as applied.

Reset-credit redemption is a separate, default-off account option. Enabling it authorizes consumption of provider-issued reset credits when its conditions are met.

### Diagnostics and code review

Refresh status first and read the provider-specific error. Diagnostic downloads use a fixed set of fields and exclude account labels, full proxy URLs, authorization URLs, credentials, and conversations. **Review a download yourself before sharing it.**

Code review is available only when the current session provides `/review`. A successful submission means the host accepted the request, **not that review is finished or the code has no security issues**. Read-only review instructions do not replace DSH tool permissions or approval policy.

<a id="handoff"></a>
## Switching a model is not switching a harness

**Switching models** selects another provider or model inside DSH. **Switching harnesses** moves work to a different tool, such as Codex or Claude Code. They are different operations.

The current feature is **manual task handoff**, not one-click migration of a running session:

1. Stop the source task and tools. Under **Task handoff**, enter the goal, completed work, next steps, and workspace-relative paths, such as `src/main.ts`.
2. Check for secrets, private conversations, and other information that should not be shared. Confirm the review, then select **Export readable summary**, or JSON for structured data.
3. Re-check authentication, workspace, model, and tool permissions in the destination. Create a new session and provide the exported summary.

Only the text you enter is exported. **Listed files are not read, tokens are not moved, permissions are not inherited, and no application is started or tool replayed.** JSON uses this plugin's handoff format; native import in other tools is not guaranteed. Do not share credential or session directories between applications as a shortcut.

<a id="troubleshooting"></a>
## Troubleshooting

| Symptom | First action |
| --- | --- |
| No “模型與帳號 / OAuth” settings entry | Check that installation and launch both use the `web` profile; restart that profile and verify versions |
| No 0.9.0 download | Use the source-build instructions until that version is published; do not rename an old package |
| Context asks you to sign in | Connect OpenAI under Accounts & quota, then return |
| Quota is blank or unavailable | Refresh status and check the provider error; missing data is not usable allowance |
| 401 or an expired entry URL | Reopen the entry printed by DSH; do not disable authentication or publish its token |
| A save fails | Keep the error, check connectivity and input; clicking a button alone is not success |
| Old UI after upgrade | Check for duplicate plugin entries and restart the profile; do not delete sessions or credentials to troubleshoot |

Load the named entries provided by the plugin package. Do not add `lib/index.js`, `openai.js`, and `anthropic.js` separately by absolute path to the Loader: this can duplicate browser-module registration.

For ordinary reports, include **DSH version, plugin version, reproduction steps, expected result, and actual result**, plus a redacted screenshot or diagnostic snapshot. Follow the [security reporting procedure](SECURITY.md#report-en) for vulnerabilities; never publish credentials.

<details>
<summary>Developers: tests, compatibility, and the handoff API</summary>

Run from the source directory. Browser checks also require Playwright Chromium:

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm exec playwright install --with-deps chromium
pnpm run test:browser
pnpm pack
```

`check` runs typechecking, regression tests, and the build. Browser tests use both fictional data and an isolated temporary DSH profile, without live OAuth accounts. Passing them does not verify every provider's real login, billing, limits, or online inference.

CI checks `0.1.2-rc.1` and `0.1.3-alpha.2` separately. The scheduled upstream canary detects upstream commit/version drift; **it does not automatically build or prove compatibility with the latest master**.

`dsh-oauth-model-providers/handoff` exports `createHandoff`, `parseHandoff`, `renderHandoff`, and `preflightHandoff`. Based on caller-supplied state, preflight rejects running source turns, unfinished tools, unverified destination authentication, and unsupported destinations. This data layer does not independently inspect other processes and is not an automatic cross-application migration engine.

</details>

## Official references and license

For DSH launch and workspace behavior, see the [official user guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md) and [CLI documentation](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md). Upstream `master` documentation can differ from your installed version.

This plugin retains its [PolyForm Noncommercial license](LICENSE). Upstream DSH's MIT license does not change the plugin's license, and a redesigned interface does not grant commercial permission.

[Back to top](#provider-control-center) · [繁體中文](README.md)
