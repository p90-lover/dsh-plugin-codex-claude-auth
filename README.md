# DeepSeek Harness OAuth model providers

An experimental DeepSeek Harness bundle that adds two independent LLM routes:

- `openai-codex-oauth` — OpenAI Codex models authenticated with a ChatGPT subscription login.
- `anthropic-oauth` — Anthropic Claude models authenticated with a Claude Pro/Max login.

The bundle uses DeepSeek Harness services for model routing, a same-origin Settings wizard, and durable credential references. OAuth login and refresh are provided by `@earendil-works/pi-ai`. After sign-in, the plugin fetches the account's provider-owned model catalog and keeps the bundled `pi-ai` catalog as an offline/failure fallback.

## Version 0.5.1 additions

- Multiple OAuth accounts per provider, account selection, live OpenAI usage/reset details, and a configurable Claude usage fallback.
- Opt-in OpenAI earned reset-credit use and one-time account failover only on confirmed pre-output usage exhaustion, with a permanent in-chat notice.
- One proxy selector for both providers, Codex only, or Claude only, including secure promotion of an existing provider proxy to the shared proxy.
- Independent simultaneous provider logins and manual provider-session refresh.
- Last-mile effort enforcement: OpenAI sends `reasoning.effort`; adaptive Claude sends `thinking.type=adaptive` plus `output_config.effort`.
- `Default` means the provider/model default, not maximum effort, and is labelled accordingly.

## Compatibility

- DeepSeek Harness `0.1.0-rc.6` (`next` channel)
- Node.js `22.19.0` or newer (Node 24 is supported)
- `@earendil-works/pi-ai` `0.82.1`

DeepSeek Harness is currently a developer preview. Pin the versions above and expect changes while its plugin API is pre-release.

## Install

Install the packed bundle into a Web profile:

```powershell
dsh plugin --profile web add .\dsh-oauth-model-providers-0.5.1.tgz
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

1. Open **Settings → OAuth Providers**.
2. Optionally set a provider-specific HTTP(S) proxy. The secret URL is write-only in the Harness credential store.
3. Click **Add Codex OAuth** or **Add Claude OAuth** and complete the steps inside the provider card. No command, chat, or Harness question overlay is required.
4. Open the provider sign-in page. The card polls the host-owned flow and automatically detects the local OAuth callback (`localhost:1455` for Codex or `localhost:53692` for Claude). Pasting the returned URL/code remains available as a fallback.
5. After sign-in succeeds, the provider appears in **Settings → Models**. The plugin automatically refreshes the models available to that account and updates the model picker.

Use the English / 繁體中文 selector at the top of this section; English is the default for this plugin page.

The legacy `/login-openai`, `/login-claude`, `/status-openai`, and `/status-claude` commands remain available as optional compatibility fallbacks, but the Settings flow does not invoke them.

Use **Disconnect** on the same Settings page, or run `/logout-openai` or `/logout-claude`. Logout removes the locally stored grant and hides that provider from the model picker; it does not promise remote revocation. Revoke the grant in the provider account when that matters.

## Credential storage

Tokens are serialized as one JSON secret per provider through the Harness credentials service:

- OpenAI: `DSH_OPENAI_CODEX_OAUTH`
- Anthropic: `DSH_ANTHROPIC_OAUTH`
- OpenAI proxy: `DSH_OPENAI_CODEX_PROXY`
- Anthropic proxy: `DSH_ANTHROPIC_PROXY`

With the standard local credentials provider, those references live in the Harness credentials store under `$DSH_HOME`. The status command exposes only sign-in and expiry state, never token contents. Refresh writes are serialized within one Harness process.

Do not copy `.credentials.yaml`, logs containing redirect URLs, proxy URLs, or a populated Harness home into source control. OAuth callback URLs contain short-lived authorization codes and should be treated as secrets.

## Proxy behavior

Each provider can use a different HTTP or HTTPS forward proxy. The proxy is applied with an async-scoped fetch dispatcher to OAuth token exchange/refresh and model requests. When a proxy is configured, model transport is forced to SSE so the request remains on the per-provider HTTP proxy path. SOCKS and PAC URLs are rejected.

The external sign-in website is opened by your browser, so that page still follows the browser's own proxy/network settings. The plugin proxy covers DSH host traffic; it does not silently reconfigure the browser or Windows.

## Automatic model discovery

OpenAI Codex discovery reads the authenticated ChatGPT Codex catalog. Anthropic discovery reads the authenticated Models API, including capability and token-limit metadata when returned. Catalog traffic uses the same provider-specific proxy as OAuth and inference traffic.

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

The focused tests cover secret-safe credential metadata, serialized refresh mutations, replay-route compatibility, authenticated catalog parsing/fallback, stored-credential callback reconciliation, proxy URL redaction, and per-provider proxy stream options.

## License

This project is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE). Commercial or anticipated commercial use is not permitted by that license. It is not an OSI-approved open-source license.
