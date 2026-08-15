# DeepSeek Harness OAuth model providers

An experimental DeepSeek Harness bundle that adds two independent LLM routes:

- `openai-codex-oauth` — OpenAI Codex models authenticated with a ChatGPT subscription login.
- `anthropic-oauth` — Anthropic Claude models authenticated with a Claude Pro/Max login.

The bundle uses DeepSeek Harness services for model routing, a same-origin Settings wizard, and durable credential references. OAuth login and refresh are provided by `@earendil-works/pi-ai`. After sign-in, the plugin fetches the account's provider-owned model catalog and keeps the bundled `pi-ai` catalog as an offline/failure fallback.

> [!WARNING]
> Using provider OAuth accounts through a third-party harness may violate the provider's terms of service and may result in account restriction, suspension, or termination. Use this project entirely at your own risk. The author and contributors accept no responsibility or liability for account action, lost access, data loss, charges, or any other direct or indirect damage arising from its use.

## Compatibility

- DeepSeek Harness `0.1.0-rc.6` (`next` channel)
- Node.js `22.19.0` or newer (Node 24 is supported)
- `@earendil-works/pi-ai` `0.82.1`

DeepSeek Harness is currently a developer preview. Pin the versions above and expect changes while its plugin API is pre-release.

## Install

Install the packed bundle into a Web profile:

```powershell
dsh plugin --profile web add .\dsh-oauth-model-providers-0.7.4.tgz
dsh --profile web
```

Use `dsh plugin` for profile installation. Do not run `npm install` directly inside `$DSH_HOME/profiles/web`: npm auto-installs the Harness peer packages and can create a second DSH runtime, which breaks agent scope identity during session resume.

For a source checkout, install dependencies, build it, and give `dsh plugin add` the package directory instead:

```powershell
pnpm install
pnpm run build
dsh plugin --profile web add .
```

The bundle inserts both routes. It does not replace the built-in API-key providers.

## Sign in from Settings and use a model

In Harness Web:

1. Optionally open **Settings → Proxies**, add one or more named HTTP(S) proxies, and select the proxy for each provider. The first proxy is the default; this provider choice also covers a new OAuth login before its account exists.
2. Open **Settings → OAuth Providers**.
3. Click **Add Codex OAuth** or **Add Claude OAuth** and complete the steps inside the provider card. No command, chat, or Harness question overlay is required.
4. Open the provider sign-in page. The card polls the host-owned flow and automatically detects the local OAuth callback (`localhost:1455` for Codex or `localhost:53692` for Claude). Pasting the returned URL/code remains available as a fallback.
5. After sign-in succeeds, the provider appears in **Settings → Models**. Return to **Settings → Proxies** if that account needs an override instead of its provider/default proxy.

Use the English / 繁體中文 selector at the top of this section; English is the default for this plugin page.

The legacy `/login-openai`, `/login-claude`, `/status-openai`, and `/status-claude` commands remain available as optional compatibility fallbacks, but the Settings flow does not invoke them.

## Remote compaction and code review

When DSH's existing automatic or manual compaction selects the OpenAI OAuth route, the plugin sends the full Responses input to OpenAI's remote compaction endpoint. Its canonical output is stored inside the DSH checkpoint and expanded back into the next request without pruning. If the endpoint fails, the same compaction attempt continues through DSH's existing local summary path.

Click **Code review** in the composer to review staged, unstaged, and untracked changes without modifying files. The equivalent commands are:

```text
/review
/review base main
/review commit HEAD~1
/review custom security and data-loss issues only
```

**Auto review** is disabled by default and remembered in the browser when you opt in. After a newly completed OpenAI Codex turn, it starts a review only when the working-tree fingerprint is new. It skips clean trees, unchanged diffs, Claude turns, and the review turn itself. The review is queued as a dedicated model turn. Its P0-P3 findings, or `No actionable findings.`, remain in the chat transcript.

## Usage, context window, and failover

A compact box beside the normal DSH composer shows the active OpenAI usage percentage, Claude 5-hour/weekly percentages, reset details on hover, and the OpenAI context-window selector. OpenAI defaults to `252K`; `353K` can be selected and is remembered in the credential-backed provider configuration. The box uses a DSH input slot and does not replace or take ownership of the text area.

Open **Settings → Failover** to see every provider DSH currently registers or declares as configurable. Choose which available providers may be used, set their order, and select a provider-level fallback model. With no explicit model, the plugin chooses a semantic middle tier when one is identifiable (for example Sonnet, Terra, Balanced, Standard, or Chat), otherwise the middle catalog entry. Each OAuth account can override that provider default or inherit it.

Automatic failover is deliberately bounded:

1. A retryable pre-output provider failure first rotates to the next OAuth account, when one exists.
2. If that retry also fails, the request moves to the first enabled alternative provider using the configured account/provider model.
3. If the alternative provider fails, the turn ends; the plugin does not cascade through every provider.

Account and provider changes are written as permanent bilingual text in the chat. Later turns in that session remain pinned to the successful fallback route even though the original picker selection is unchanged. Foreign replay state and source-model defaults are removed before retargeting, then the destination model's own reasoning/output defaults are resolved, preventing provider/model replay mismatches. Failover only happens before model output; it never replays a partially emitted answer or tool call.

## Codex tool calls inside DSH

The OpenAI OAuth route uses DSH's normal tool runtime. DSH function schemas are passed to the Codex Responses request; streamed tool calls retain their names, arguments, and `call_id`; DSH executes the tools; and the linked results plus replay metadata are sent back on the next model step. The route wrapper normalizes the durable provider identity to `openai-codex-oauth`, preventing the upstream/public-provider mismatch that previously produced `INVALID_REPLAY_STATE`.

Use **Disconnect** on the same Settings page, or run `/logout-openai` or `/logout-claude`. Logout removes the locally stored grant and hides that provider from the model picker; it does not promise remote revocation. Revoke the grant in the provider account when that matters.

## Credential storage

Tokens are serialized as one JSON secret per provider through the Harness credentials service:

- OpenAI: `DSH_OPENAI_CODEX_OAUTH`
- Anthropic: `DSH_ANTHROPIC_OAUTH`
- OpenAI proxy: `DSH_OPENAI_CODEX_PROXY`
- Anthropic proxy: `DSH_ANTHROPIC_PROXY`
- Reusable proxy list: `DSH_OAUTH_SHARED_PROXY`
- Failover order/provider defaults: `DSH_OAUTH_FAILOVER_CONFIG`

With the standard local credentials provider, those references live in the Harness credentials store under `$DSH_HOME`. The status command exposes only sign-in and expiry state, never token contents. Refresh writes are serialized within one Harness process.

Do not copy `.credentials.yaml`, logs containing redirect URLs, proxy URLs, or a populated Harness home into source control. OAuth callback URLs contain short-lived authorization codes and should be treated as secrets.

## Proxy behavior

The first entry in the reusable proxy list is the default. A provider assignment overrides that default for its OAuth login and unassigned accounts; an account assignment overrides both. The same selected HTTP or HTTPS forward proxy is applied with an async-scoped fetch dispatcher to OAuth token exchange/refresh, usage/catalog checks, and model requests. When a proxy is selected, model transport is forced to SSE so the request remains on its HTTP proxy path. SOCKS and PAC URLs are rejected.

Proxy URLs are write-only from the Settings client. Public status contains only the proxy ID, user-supplied name, redacted host, and provider/account assignment. Removing an assigned proxy safely falls back to the current first entry.

The external sign-in website is opened by your browser, so that page still follows the browser's own proxy/network settings. The plugin proxy covers DSH host traffic; it does not silently reconfigure the browser or Windows.

## Automatic model discovery

OpenAI Codex discovery reads the authenticated ChatGPT Codex catalog. Anthropic discovery reads the authenticated Models API, including capability and token-limit metadata when returned. Catalog and usage traffic use the same effective provider/account proxy as OAuth and inference traffic.

If discovery is unavailable, times out, or returns an invalid response, the plugin keeps the last known catalog; on a fresh start it falls back to the bundled `pi-ai` models. A catalog failure does not remove an already connected provider.

## Configuration

The inserted Cordis row ids are `llm-openai-codex-oauth` and `llm-anthropic-oauth`. A profile patch can replace either row's config. A DeepSeek Harness id-targeted patch replaces the whole config, so restate every non-default value you want to keep. Start from [`config/examples/oauth-providers.example.yml`](config/examples/oauth-providers.example.yml).

Runtime configuration is deliberately separate from source control. Keep local overrides under `config/runtime/` or name them `config/*.local.yml`; both forms are ignored. OAuth credentials, proxy URLs, populated profiles, and callback URLs must remain in the Harness credential/profile store and never be copied into this repository. The tracked `cordis.patch.yml` is only the secret-free bundle composition manifest required by DSH.

Optional transport controls are `transport`, `timeoutMs`, `websocketConnectTimeoutMs`, and `retryPolicy`, matching `dsh-llm-pi-ai` behavior.

## Important limits

- OpenAI OAuth here is the Codex/ChatGPT subscription route. It is not a way to turn a ChatGPT subscription into arbitrary OpenAI API access.
- Anthropic OAuth here targets the Claude Pro/Max flow used by Claude coding tools. It is not the Anthropic API-key route.
- These consumer OAuth flows are not documented as a stable, general-purpose third-party integration contract. Provider-side policy or protocol changes can break them. Check the applicable provider terms before use; prefer official API credentials for production integrations.
- Refresh serialization is process-local. Do not run multiple Harness processes against the same OAuth credential reference, because rotating refresh tokens can race across processes.
- Remote model catalogs are advisory provider responses. The bundled catalog remains the safety fallback when discovery cannot be completed.
- A real account login was deliberately not automated by the test suite. Complete each login interactively and verify one model request in your own profile.
- A successful proxy setup check is not proof of a completed model request. Verify one real request after OAuth succeeds.

## Development checks

```powershell
pnpm run typecheck
pnpm test
pnpm run build
```

The focused tests cover remote compaction request/restore behavior, automatic and manual read-only review contracts, Codex tool definition/call/result identity, secret-safe credential metadata, serialized refresh mutations, replay-route compatibility, authenticated catalog parsing/fallback, stored-credential callback reconciliation, reusable proxy migration/default/assignment precedence, proxy URL redaction, proxy stream options, context-window persistence, and bounded account-first/provider-second failover.

## License

Anyone may download the source and use, study, modify, and redistribute it for permitted noncommercial purposes under the [PolyForm Noncommercial License 1.0.0](LICENSE). Commercial or anticipated commercial use requires a separate commercial license from the copyright holder. MIT is not applied because the MIT License permits commercial use. PolyForm Noncommercial is source-available, not an OSI-approved open-source license.
