# Security / 安全說明

## Scope

This plugin is not a sandbox and has not received an independent security audit. Its review instructions do not enforce read-only execution; the active Harness preset owns tool and approval policy. Use only authorized provider accounts and follow their applicable conditions.

## 0.9.0 hardening

- All browser status, flow, and mutation routes are checked through Harness's native `connection.requestRejection` before reading credentials. POST still requires JSON and same-origin validation. Responses are no-store and nosniff; request bodies are bounded to 16 KiB.
- The browser receives public account metadata only. Diagnostic downloads use a deliberate field allowlist and exclude credentials, proxy URLs, authorization URLs, account labels, and conversations.
- Errors redact common bearer tokens, OAuth query parameters, credential-shaped JSON fields, proxy userinfo, and JWT-shaped strings. Pattern redaction is defense in depth, not proof that arbitrary text contains no secret.
- Quota requests use fixed HTTPS destinations, bounded timeouts, and refuse redirects. Missing quota is unknown, not 100% remaining.
- Cross-provider fallback defaults to explicit opt-in. It does not start after committed output/tool results, and manual model selection invalidates a stale sticky route.
- Untracked-file review fingerprints skip symlinks and non-regular files, check workspace containment, use no-follow opens where available, and bound reads.
- Undici is updated from 7.28.0 to 7.29.0. The dependency audit covers this package's own production graph, not every dependency of an independently installed Harness or editor.
- Portable handoff uses a bounded, versioned allowlist. It neither exports credentials/native replay state nor executes tools, imports permissions, reads referenced files, or starts another harness.

## Known boundaries

Account-specific OAuth proxying retains a process-level fetch wrapper with AsyncLocalStorage routing. Outside the explicit provider scope it delegates to the original fetch/global Harness dispatcher. Do not run untrusted plugins in the same process or assume this isolates mutually hostile tenants. Restart the profile after upgrading transport code.

The plugin's pre-existing multi-account credential format is retained to avoid destructive migration. It is bridged into the new pi-ai auth injection; it has not been converted wholesale to Harness's native authorization-record format.

Real OAuth flows, account limits, regional availability, and provider changes cannot be fully checked by hermetic CI. Release notes distinguish fixture interactions from actual host boot and live provider operations.

## Reporting

Do not disclose a usable token, private conversation, login URL, `.credentials` file, or proxy password in a public issue. Revoke exposed secrets first. Use private GitHub vulnerability reporting when enabled; otherwise post only a non-sensitive contact request to arrange private details.

Never weaken browser authentication, change permission presets to bypass a failure, or forward credentials to another harness as a compatibility workaround.
