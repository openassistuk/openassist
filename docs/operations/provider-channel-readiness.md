# Provider, authentication and channel readiness

Checked on 2026-09-27 for PR #61. Package versions were compared with npm registry tags and upstream release notes. This records implemented compatibility, not live account certification.

## Installed stable dependencies

| Component | Locked version | Result |
| --- | --- | --- |
| OpenAI SDK | 7.23.0 | Current stable; shared by OpenAI and Azure |
| Anthropic SDK | 0.128.0 | Current stable |
| Azure Identity | 4.13.3 | Current stable |
| Discord.js | 14.27.0 | Current stable; adapter uses clientReady |
| Telegram grammY | 1.46.0 | Current stable; supports Bot API 10.3 |
| WhatsApp Baileys | 6.7.24 | Current stable legacy tag; latest is 7.0.0-rc14 |
| Vitest / coverage-v8 | 5.0.2 | Updated together from 5.0.1 |

The channel and provider SDK upgrades were already present before this PR's follow-up audit. A newer model does not require a new Discord/Telegram bot token or WhatsApp pairing. Retain the patched Baileys legacy release and its narrowly scoped security overrides; a Baileys 7 migration needs separate protocol/session validation. Node types remain on the supported Node 24 series.

Release references: [Discord](https://github.com/discordjs/discord.js/releases/tag/14.27.0), [grammY](https://github.com/grammyjs/grammY/releases/tag/v1.46.0), [Baileys](https://github.com/WhiskeySockets/Baileys/releases), [OpenAI SDK](https://github.com/openai/openai-node/releases), [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript/releases), [Azure Identity](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/CHANGELOG.md), [Vitest patch](https://github.com/vitest-dev/vitest/releases/tag/v5.0.2).

## Authentication

OpenAI API keys remain separate from Codex account login. Codex retains PKCE browser/callback and device-code login, account/session headers, encrypted local credential persistence and automatic refresh. Enable device-code login in account/workspace settings when required. The runtime now compares a failed request's original token with the current token, so a delayed 401 reuses a concurrent refresh instead of rotating credentials again. Retry remains bounded to one. See [official Codex authentication](https://learn.chatgpt.com/docs/auth).

Anthropic's existing workspace-scoped keys remain valid. New personal/service-account keys spanning workspaces require `anthropic-workspace-id`. Set optional `workspaceId = "wrkspc_..."` under the Anthropic provider, or enter it in quickstart/wizard. It is an identifier, not the API key. Leave it blank for a workspace-scoped key. Explicit OAuth access tokens use bearer auth; explicit API keys retain the SDK's supported key header. The unused credential kind is explicitly disabled so ambient SDK environment variables cannot select another identity. Expired API keys require replacement, not OAuth refresh. See [Anthropic authentication](https://platform.claude.com/docs/en/manage-claude/authentication).

Azure retains API-key or `DefaultAzureCredential` authentication with `https://ai.azure.com/.default` for the resource-style `/openai/v1/` route. Token acquisition remains delegated to Azure Identity; OpenAssist account-link storage is not involved. See [Microsoft's Entra guidance](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/configure-entra-id).

Optional vendor enterprise features, such as workload federation, Codex enterprise access tokens and Anthropic App Attest, are not newly enabled by this refresh. They need their own configuration and deployment design. Claude consumer-subscription tokens are not advertised as an API-key replacement.

## Local reasoning and tool harness

Responses adapters now request opaque reasoning content for cataloged reasoning models even when effort is left at Default. They preserve output items, including message phase and function calls, in existing durable replay metadata. Replay is scoped to provider route, configured provider and model; Azure additionally scopes it to the underlying-model hint. Tool audit rows remain intact and are deduplicated only in the outgoing API request.

Each replay record is capped at 1 MiB and 256 items. Malformed, oversized or differently scoped metadata falls back to ordinary text/tool history. Existing runtime history trimming still applies; this is not unlimited reasoning memory. Opaque reasoning is never added to the visible reply. No server-side conversation chaining, larger context limits, parallel local tool execution or new tool privileges are introduced. See [OpenAI reasoning persistence](https://developers.openai.com/api/docs/guides/reasoning) and [model compatibility](../providers/model-compatibility.md) for Claude's separate signed-block handling.

## Verification and live checks

Regression tests cover request payloads, persisted metadata after database reopen, duplicate tool-call suppression, replay bounds and scope mismatch, delayed-401 refresh reuse, Anthropic credential isolation/workspace headers and setup save/reload. Full verification includes unchanged coverage gates and both dependency audits. Hosted Linux/macOS/Windows quality, CodeQL and the live macOS LaunchAgent gate must pass on the final revision.

Existing beta testing is useful evidence once the tested commit, OS, route/model, channel and result are recorded. On a designated test installation, check first reply, a permitted tool action, image/document handling, service restart with conversation continuity, token refresh where applicable, and channel reconnect/persisted pairing. API-key expiration cannot be repaired automatically. Real provider access, channel sessions and Node migration/rollback remain explicit release-certification work; mocked tests do not prove them.
