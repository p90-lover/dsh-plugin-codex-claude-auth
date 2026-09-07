# Provider Control Center

[中文](README.md) | **English**

Manage OpenAI Codex and Anthropic Claude OAuth accounts inside DeepSeek Harness. Accounts, quota, context, proxy routing, fallback, and diagnostics are grouped into one accessible settings surface.

> **Version 0.9.0:** baseline DSH `0.1.2-rc.1`, with separate compatibility checks for `0.1.3-alpha.2`. Both Harness versions are prereleases. This is not a promise of compatibility with every future release. Plugin 0.8.0 should not be installed unchanged into the new Harness generation.

## Install or upgrade

Back up your DSH profile and credential storage privately. Do not upload those backups to GitHub. You do not need to delete accounts or conversations.

1. Install a supported DSH build and check `dsh --version`.
2. Download `dsh-oauth-model-providers-0.9.0.tgz` and `SHA256SUMS` from [Releases](https://github.com/p90-lover/dsh-plugin-codex-claude-auth/releases).
3. Run from the download directory:

```powershell
dsh plugin --profile web add .\dsh-oauth-model-providers-0.9.0.tgz
```

Restart that profile and open **Settings → 模型與帳號 / OAuth**. The page has an English switch. Use the package's named Loader entries; do not separately load its three compiled entry files by absolute path, which can register the same browser module more than once.

Node requirements follow Harness: `^22.19.0 || >=24.0.0`. Release checks run on Node 24.

## Connect an account

Open **Accounts & quota**, choose a provider, and select **Connect account**. Complete the provider's browser authorization. Use the displayed authorization-code/return-URL input when automatic callback is unavailable.

Provider account, plan, region, and usage conditions still apply. Connect only accounts you are authorized to use. Credentials remain in the local Harness credential service. “Signed in” confirms locally stored authentication, not remote health or available quota.

## Manage requests

| Page | Purpose |
| --- | --- |
| Accounts & quota | Add or select accounts, inspect remaining quota and reset times, refresh, and confirm local sign-out |
| Context | Choose a requested limit and see the actual per-model cap |
| Proxy routing | Save write-only proxy URLs and assign provider/account routes |
| Fallback | Explicitly authorize destinations, set order, model, and supported reasoning effort |
| Diagnostics | See host response state and export a narrowly allowlisted diagnostic snapshot |
| Task handoff | Review and export your own task summary as Markdown or JSON |

### Quota counts down

Percentages mean **remaining**, from 100% after a reset to 0% when exhausted. Missing data remains unavailable; it is never presented as a fresh 100%. Claude exposes five-hour and weekly windows. The composer follows the real session selection: Claude does not show OpenAI quota or context controls.

### Context controls respect model capacity

Presets: `252K`, `353K`, `500K`, `1M`, plus **Custom**. Requested custom limits accept 252,000–1,000,000 tokens. Effective capacity is the lower of that preference and the model's advertised native capacity. A 400K model is not made into a 1M model by selecting 1M.

A confirmed save refreshes provider snapshots for subsequent requests. In-flight requests retain their prepared generation. Automatic compaction remains owned by the active Harness agent preset; the plugin does not mount a second compaction service or claim a universal 90% trigger. Provider-native OpenAI compaction retains the existing DSH summary fallback.

### Proxy routing has a clear order

**Valid account override → valid provider override → shared default → Harness networking.** Only redacted host information is displayed. HTTP/HTTPS proxies are supported; SOCKS/PAC are not. Provider sign-in pages use the browser's own networking. Cancel an active sign-in before editing its proxy.

### Fallback needs permission

Cross-provider fallback is **off by default**. Enable only trusted destinations: request content can include private project information. Existing explicitly enabled preferences are retained.

Recovery first tries another saved account for the same provider, then at most one permitted destination. Provider defaults and per-account overrides support model and advertised reasoning effort. Unsupported efforts are refused. Committed output/tool results prevent automatic replay, avoiding duplicate side effects.

Reset-credit redemption is a separate, default-off account preference. Enabling it authorizes consumption of provider-issued reset credits when exhaustion is confirmed.

### Cross-harness task handoff

This release implements **manual, reviewable task transfer**. Enter the goal, completed work, next steps, and workspace-relative paths; export a summary for a new destination session. No listed files are read, and no Codex/Claude Code process is launched. Credentials, native transcripts, tool permissions, and opaque compaction state are not transferred.

The `dsh-oauth-model-providers/handoff` library exports `createHandoff`, `parseHandoff`, `renderHandoff`, and `preflightHandoff`. The preflight rejects running source turns, unfinished tools, unauthenticated destinations, and unsupported adapters. It is a portable data layer, **not a finished automatic live-session migration engine**. Secret-pattern checks assist review and cannot detect every possible secret.

### Code review

Review is enabled only when the session advertises `/review`. The control waits for the host's result instead of presenting a cosmetic success. Read-only review instructions do not replace actual preset permissions and approval policy.

## Troubleshooting

**Blank quota or a failed button:** refresh status and read the provider-specific error. For browser-authentication 401s, reopen the entry supplied by DSH. Never publish its one-time login token.

**Old values after upgrade:** confirm the same profile does not load duplicate plugin entries, then restart it. The state controller fences stale background reads so they cannot overwrite confirmed saves.

**Signing out:** removes local sign-ins for that provider, not conversations. Revoke the remote authorization separately on the provider website.

**Switching applications:** do not assume native transcripts, permissions, or compacted state are interchangeable. Use the task-handoff summary and revalidate authentication, workspace, and tools at the destination.

## Development

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm exec playwright install --with-deps chromium
pnpm run test:browser
pnpm pack
```

Tests cover native request authentication, quota parsing, proxy assignments, model snapshots, bounded fallback, frontend failure states, and task handoff. Browser checks use an isolated profile without real OAuth accounts. Passing CI does not establish a successful live login or request for every provider.

See [SECURITY.md](SECURITY.md) and [CHANGELOG.md](CHANGELOG.md). Report versions, reproduction steps, and redacted diagnostics—not credentials, proxy passwords, or private transcripts.

The existing [PolyForm Noncommercial license](LICENSE) is unchanged. SaaS-style visual design does not grant commercial licensing rights.
