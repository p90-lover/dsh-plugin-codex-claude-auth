# DeepSeek Harness OAuth model providers

An experimental DeepSeek Harness bundle that adds two independent LLM routes:

- `openai-codex-oauth` — OpenAI Codex models authenticated with a ChatGPT subscription login.
- `anthropic-oauth` — Anthropic Claude models authenticated with a Claude Pro/Max login.

The bundle uses DeepSeek Harness services for commands, questions, model routing, and durable credential references. OAuth login and refresh are provided by `@earendil-works/pi-ai`; model lists come from that package instead of being hard-coded here.

## Compatibility

- DeepSeek Harness `0.1.0-rc.6` (`next` channel)
- Node.js `22.19.0` or newer (Node 24 is supported)
- `@earendil-works/pi-ai` `0.82.1`

DeepSeek Harness is currently a developer preview. Pin the versions above and expect changes while its plugin API is pre-release.

## Install

Install the packed bundle into a Web profile:

```powershell
dsh plugin --profile web add .\dsh-oauth-model-providers-0.2.4.tgz
dsh --profile web
```

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
2. Click **Add Codex OAuth** or **Add Claude OAuth**. If no chat is open, Harness creates one automatically; Settings then closes and the secure flow continues there.
3. Follow the browser URL/device-code prompts in the Harness question UI.
4. After sign-in succeeds, the provider and its models appear automatically in the model picker.

The conversation composer also accepts `/login-openai`, `/login-claude`, `/status-openai`, and `/status-claude` as direct alternatives.

Use **Disconnect** on the same Settings page, or run `/logout-openai` or `/logout-claude`. Logout removes the locally stored grant and hides that provider from the model picker; it does not promise remote revocation. Revoke the grant in the provider account when that matters.

## Credential storage

Tokens are serialized as one JSON secret per provider through the Harness credentials service:

- OpenAI: `DSH_OPENAI_CODEX_OAUTH`
- Anthropic: `DSH_ANTHROPIC_OAUTH`

With the standard local credentials provider, those references live in the Harness credentials store under `$DSH_HOME`. The status command exposes only sign-in and expiry state, never token contents. Refresh writes are serialized within one Harness process.

Do not copy `.credentials.yaml`, logs containing redirect URLs, or a populated Harness home into source control.

## Configuration

The inserted Cordis row ids are `llm-openai-codex-oauth` and `llm-anthropic-oauth`. A profile patch can replace either row's config. A DeepSeek Harness id-targeted patch replaces the whole config, so restate every non-default value you want to keep.

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

Optional transport controls are `transport`, `timeoutMs`, `websocketConnectTimeoutMs`, and `retryPolicy`, matching `dsh-llm-pi-ai` behavior.

## Important limits

- OpenAI OAuth here is the Codex/ChatGPT subscription route. It is not a way to turn a ChatGPT subscription into arbitrary OpenAI API access.
- Anthropic OAuth here targets the Claude Pro/Max flow used by Claude coding tools. It is not the Anthropic API-key route.
- These consumer OAuth flows are not documented as a stable, general-purpose third-party integration contract. Provider-side policy or protocol changes can break them. Check the applicable provider terms before use; prefer official API credentials for production integrations.
- Refresh serialization is process-local. Do not run multiple Harness processes against the same OAuth credential reference, because rotating refresh tokens can race across processes.
- A real account login was deliberately not automated by the test suite. Complete each login interactively and verify one model request in your own profile.

## Development checks

```powershell
pnpm run typecheck
pnpm test
pnpm run build
```

The focused tests cover secret-safe credential metadata, serialized refresh mutations, and preservation of the upstream provider identity during routed dispatch.
