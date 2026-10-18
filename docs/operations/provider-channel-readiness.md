# Provider, authentication and channel readiness

`0.2.5` now includes manual `/compact` and default-on `runtime.context.autoCompact` across the common provider/channel runtime. Manual commands consume normal provider quota for bounded tool-free summaries; auto-off preserves guards and prevents automatic foreground/overflow/maintenance summaries. Offline command/scope/restart tests and new actual-head gates are recorded in the [controls plan](../execplans/manual-compaction-2026-10-18.md), separately from paid/live certification.

Checked on 2026-09-27 for [PR #61](https://github.com/openassistuk/openassist/pull/61), merged as `0ac0921`. Package versions were compared with npm registry tags and upstream release notes during that implementation. This is a dated record of implemented compatibility, not live account certification or a claim that registry versions never change.

## October 18 context release

The signed [v0.2.5 release](../releases/v0.2.5.md) delivers PR #88's common context admission across all five routes and PR #89's manual/automatic controls. Native OpenAI Responses/Anthropic counting where supported, explicit unknown serving limits and bounded durable recovery preserve saved models/tuning and all profile, attachment and delivery boundaries. Reviewed main/tag `190727f` passes exact-main CI/full CodeQL, candidate/native/signing checks, protected publication and all four public-install targets; independent signatures/digests verify. The [release plan](../execplans/stable-0.2.5-release.md) retains the initial main Windows timing timeout and unchanged-code retry separately. Live provider/account/quota/channel and replacement-host tests remain unverified; successful offline/public-install checks do not certify them.

## October 16 source integration update

Merged PR #84 moves source builds to OpenAI SDK `7.31.0`, Anthropic SDK `0.132.1`, cron-parser `5.10.2` and Inquirer prompts `8.7.3`. The follow-up Anthropic maintenance uses SDK `0.135.0`, verified as npm's stable tag on October 16, and adds Haiku 5.5 to the shared catalog. OpenAssist does not invoke the new managed-agent or speed APIs; SDK tracing/logging are explicitly disabled. Signed v0.2.4 delivers these changes with four-target public-install verification; older immutable v0.2.3 retains SDK `0.131.0` and the earlier catalog. Existing installations must update explicitly.

The native adapter now maps runtime tool names to valid API identifiers, preserves complete assistant tool turns with or without thinking, groups results and replays new metadata only within its provider/model scope and 1 MiB/256-block bounds. Legacy metadata remains readable. Explicit endpoint, auth and workspace settings override ambient SDK values. Haiku 5.5 defaults to adaptive/medium with a `16384`-token output ceiling; disabled thinking works at low/medium/high and removes opaque thinking from replay. The [integration plan](../execplans/anthropic-integration-2026-10-16.md) records real-SDK offline HTTP/SSE regressions and unchanged policy/audit gates. Live Anthropic credit/account/channel testing is deferred by the operator; local checks do not certify it.

## September 27 dependency baseline (historical)

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

September 30 post-release security reconciliation: the final merged-main audit reported five high and two moderate advisories in Baileys's Axios `1.18.0`. Source builds containing the [repair](../execplans/post-release-axios-audit-2026-09-30.md) require Axios `1.20.0` through the existing override while retaining Baileys `6.7.24`. Published stable `v0.2.0` and preview `v0.2.0-rc.1` packages retain the affected dependency; source checks do not update or recertify those immutable packages. Signed [v0.2.1](../releases/v0.2.1.md) now delivers the repair; existing installations must explicitly select the stable update to receive it. Public-install verification does not certify a live WhatsApp session.

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

Current evidence separates those categories:

| Check | Recorded result |
| --- | --- |
| PR #61 local full gate | Passed on `fef5bdf`: 406 Vitest tests, 188 Node passes and 3 platform skips; both coverage gates and zero-finding production/full audits |
| PR #61 hosted checks | Passed on final head `310142d`: [three-platform CI](https://github.com/openassistuk/openassist/actions/runs/36336356460), [CodeQL](https://github.com/openassistuk/openassist/actions/runs/36336356445), [live macOS LaunchAgent](https://github.com/openassistuk/openassist/actions/runs/36336356428) |
| Designated live provider/channel matrix | Pending recorded per-route/per-channel evidence; general beta success has been reported |
| Existing-install Node 22 to Node 24 migration and rollback | Pending real-host evidence; automated runtime guards and temporary-home installation checks cover different scenarios |

To turn a beta run into evidence, record the following in the active release ExecPlan or PR. Include only sanitized output; omit keys, tokens, env-file contents and private conversation data.

```text
Date and tested commit/build:
Host OS/architecture and shell/service Node versions:
Provider route, model (Azure deployment plus underlying-model hint), auth kind:
Channel and scope (private/group/thread/DM as applicable):
First reply: pass/fail/not exercised, with a brief observation
Permitted tool action: pass/fail/not exercised; access profile used
Image and text-document handling: pass/fail/not exercised
Restart and conversation continuity: pass/fail/not exercised
Auth refresh or key rotation: pass/fail/not applicable; method exercised
Reconnect and persisted channel session: pass/fail/not exercised
Sanitized evidence location and remaining failures:
```

Exercise each configured route/channel combination that the release claims to support; one successful combination does not certify the others. Use a designated test host and accounts, with authorization for calls that incur cost. Keep standard mode for normal replies; enable full access only for the approved test identity when exercising tools, then restore the original access settings. Do not invalidate production credentials to force a refresh.

For Node migration, use a disposable copy of an existing Node 22 installation or an authorized test installation and follow [Node 24 runtime migration](upgrade-and-rollback.md#node-24-runtime-migration). Record the original build, backup location, old/new service executable paths and versions, upgrade/health result, state continuity and actual restoration of the old build/runtime/service definition. A documented procedure or upgrade dry-run alone is not rollback evidence. Fresh-install smoke, live migration and live provider checks should remain separate entries.
