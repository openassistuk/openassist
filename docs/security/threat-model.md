# Threat Model

Release downloads are authenticated by RSA/SHA-256 signatures and bounded hash/size checks before activation. Archive traversal/escaping links are rejected. Link targets are resolved component by component against the complete archive entry map before extraction; parent traversal through aliases, cycles and chains beyond 40 links fail closed, including forward references. Legitimate internal package links remain supported. Production keys are excluded from PR jobs. Lifecycle locks/journals protect interrupted activation; ownership and path-containment checks protect uninstall. Rollback never silently restores stale idempotency data. Isolated source instances are not sandboxes for untrusted code; their builds execute as the operator. See [release maintenance](../operations/release-maintenance.md).

Hardlinks must target regular archive files directly. A hardlink to a symlink is rejected because it could copy a relative symlink into a different parent and make its previously safe target escape. Dedicated developer env-file credentials are loaded only for the daemon after source preparation; builds receive the sanitized host environment. The launcher enforces instance paths/service identity and excludes runtime-loading overrides from the dedicated file. Shell-profile ownership covers exact marked PATH blocks rather than whole user files; edited, ambiguous or unrecognized content is preserved on uninstall.

This document covers OpenAssist local-first single-operator deployments.

Installed-client update discovery fetches fixed public GitHub catalogues and compares saved versions/refs locally. No saved selector, credential, configuration content or request body is included in discovery requests. The chosen catalogue and number of pages can reveal the kind/range of lookup; GitHub still sees ordinary connection metadata. Custom source remotes are excluded from opportunistic checks. Availability is advisory, not proof of authenticity or compatibility: preparation still verifies the selected signed release manifest, platform/state versions and artifact hash/size before activation. Explicit artifact downloads necessarily reveal the selected published release; explicit source builds still fetch the requested Git ref.

`lifecycle-download.ts` permits only the required OpenAssist repository API routes and release-download paths. Every redirect is checked before fetching. API requests stay within those API routes; release assets may redirect to `release-assets.githubusercontent.com` or `objects.githubusercontent.com`. HTTPS, default HTTPS ports, no embedded URL credentials, no fragments, no ambient request credentials and no referrer are required. Unknown destinations fail closed; no operator-configurable bypass exists. HTTPS and the destination restriction complement release signatures, rather than replacing them. This policy applies to the installed Node client; the initial shell bootstrap remains the separately documented HTTPS/OpenSSL trust entrypoint.

Discovery has one ten-second deadline. Release/tag catalogues allow at most ten pages of 100 entries with 2 MiB per page; the complete refs response allows 4 MiB and 10,000 entries. Invalid, missing, ambiguous or over-limit results return unavailable instead of selecting a different target or claiming the installation is current. Cache lifetime and explicit notification opt-out remain unchanged. Security closure requires a fresh scanner result with the original alert reopened, not an inline suppression or a green check alone.

Discovery responses are not written into the notification cache. Its schema stores only a local timestamp, an enumerated availability status and an explicit-target boolean. Exact discovered versions/commits remain transient for the fresh check result; cached notices use a generic availability message. Readers validate the cache and project only those fields, ignoring legacy unversioned records and unrelated properties. This keeps untrusted server text out of durable notification state; authenticated installation metadata remains a separate lifecycle record.

## Scope

In scope:

- daemon and CLI command surfaces
- local HTTP API
- provider, channel, tool, skill modules
- scheduler and clock-health subsystems
- local durability and logs

Out of scope:

- multi-tenant hosted control plane
- WebUI/browser attack surface
- plugin sandbox guarantees

## Protected Assets

- provider API keys and linked-account OAuth tokens, including Codex account-login refresh state
- channel credentials
- local filesystem integrity
- conversation and scheduler run history
- global assistant profile memory (`system_settings` / `assistant.globalProfile`) plus per-session host bootstrap context (`session_bootstrap`)
- rolling session summaries (`session_memory`) plus actor-scoped permanent memories (`permanent_memories`)
- access assignments (`policy_profiles`, `actor_policy_profiles`, approved operator channel settings)

## Threats and Controls

### Dependency denial of service

The source dependency overrides require Undici `6.28.1` on the existing 6.x provider/Discord paths to address an uncaught WebSocket-handshake exception from a malicious or compromised server ([GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5)). Coverage tooling resolves brace-expansion `5.0.12` to address stack exhaustion from nested brace groups and comma parsing ([GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p)), plus a moderate CPU-exhaustion advisory in brace rewriting ([GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)). Regression tests reject older affected resolutions; production and full audits remain mandatory and fail on high/critical findings or registry errors. These floors protect subsequent builds and do not alter already published preview artifacts.

The post-release Axios repair requires `1.20.0` through WhatsApp/Baileys. Five high advisories cover data-URI/proxy normalization denial of service, polluted `toFormData` options, HTTP/2 DNS/proxy control bypass and an unhandled HTTP/2 session error (`GHSA-c29m-xwm3-cm6r`, `GHSA-mghh-pgcx-3jjj`, `GHSA-x97p-jq2g-jp4f`, `GHSA-3pq3-5fj3-cg6v`, `GHSA-542g-h47m-68v8`); two moderate advisories (`GHSA-vh66-26gq-q6x8`, `GHSA-9fr6-4gfg-395g`) share the same patched floor. This removes affected dependency resolutions without asserting an observed OpenAssist exploit. Published stable `v0.2.0` and preview `v0.2.0-rc.1` packages retain Axios `1.18.0`; source repair and automated gates do not update their contents. Signed [v0.2.1](../releases/v0.2.1.md) delivers the repair; existing installations must update to receive it. See the separate [audit repair](../execplans/post-release-axios-audit-2026-09-30.md) and [publication evidence](../execplans/stable-0.2.1-release.md). Keep audit gates and release signatures mandatory.

The October 4 development-tooling repair removes `@tktco/node-actionlint@1.6.0>fast-glob` and its micromatch/braces subtree. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects braces through 3.0.3 with stack-exhaustion denial of service and had no published patch when verified. OpenAssist uses the unaffected actionlint library API and Node's built-in globbing instead of the upstream standalone CLI. Regression tests prove that syntax errors, unknown runner labels, missing targets and action-version policy still fail. Production dependencies and published packages are unchanged; this is a contributor/CI dependency path, with no claim of an observed runtime exploit or advisory suppression. See the [repair evidence](../execplans/ci-braces-workflow-lint-2026-10-04.md).

The October 6 development-tooling repair resolves `source-map-js` to `1.2.2` on Vite/PostCSS and coverage-v8/magicast paths. [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) affects versions `>=1.0.0 <1.2.2`: large indexed source-map section offsets can block the event loop. An affected-version override and resolved-version regression floor exclude vulnerable versions while retaining the full audit gate. Production dependencies and immutable published packages are unchanged; no runtime exploit is asserted. See the [repair evidence](../execplans/ci-source-map-audit-2026-10-06.md).

### Release publication evidence

The read-only `publication-checks` prerequisite requires successful workflow lint, Linux/macOS/Windows CI and actual full main-branch CodeQL analysis for the exact release-tag commit. It rejects missing, pending, failed or skipped evidence and does not fall back to an older green run or PR-only analysis. The protected publish job rechecks before production signing; credentials and remote error bodies are never printed. These checks supplement signatures, dependency audits and maintainer approval. They do not update existing packages or replace separate inspection of open code-scanning alerts and unresolved review threads. PR artifact builds and existing-publication verification remain separate.

### Runtime instance identity

`runtimeInstanceId` in `packages/config/src/build-identity.ts` returns the first 24 lowercase hex characters of SHA-256 over the resolved configuration path. This identifies which daemon instance answered health checks; it is not a password hash, credential, authentication token or grant of access. It reads no configuration or env-file contents. Existing IDs remain stable through credential changes, restarts and upgrades at the same path. Activation requires matching build and instance health, and retains its separate lifecycle controls.

CodeQL alert #42 classified account-link test directory labels as password inputs and followed their paths into this fingerprint. Those fixture factories now accept no caller-provided labels and use a fixed non-secret prefix with `mkdtemp` uniqueness. The production fingerprint algorithm and health checks are preserved. Verification requires the full reported trace and a fresh full branch CodeQL analysis, rather than an alert dismissal, suppression or PR-diff-only result.

### Privileged host action misuse

Controls:

- policy profiles gate tool boundaries
- explicit elevation to `full-root`
- autonomous chat tool execution only in `full-root` sessions
- approved operator IDs are required before chat-side `/access` changes are allowed
- `/access` changes only the current sender in the current chat and never grants Unix root
- audit logs for tool activity (`tool.call.*`, `audit.exec`, `audit.fs.*`, `audit.pkg.install`)
- minimal exec guardrails enabled by default

### Capability confusion and tool overclaiming

Controls:

- runtime injects a bounded awareness snapshot on every provider turn
- the same awareness boundary is exposed to operators via `/start`, `/help`, `/capabilities`, `/grow`, `/status`, and `openassist tools status`
- awareness snapshot includes explicit negative capability text when autonomy is disabled or native web search is unavailable
- awareness snapshot now also includes a curated local docs/config/install map, capability domains, managed-growth state, plus explicit safe-maintenance and protected-path rules
- awareness snapshots are persisted in `session_bootstrap` without raw secrets and refreshed when effective access/tool state changes
- `/status` exposes the current sender ID, canonical session ID, effective access, access source, and active tool-loop budget so operators do not need to guess identity formats
- `/status` keeps detailed config/env/install filesystem paths hidden from unapproved chat senders even though the high-level lifecycle summary stays available
- `/grow` keeps managed growth directories hidden from unapproved chat senders even though the high-level growth policy stays available

### Secret leakage

Controls:

- centralized deep redaction in logs and error paths
- encrypted OAuth token storage
- encrypted OAuth PKCE flow verifier storage (`enc:` payloads; plaintext fallback read only for legacy rows)
- env-file secret pattern with `env:VAR_NAME` references in config
- schema-level rejection of plaintext secret-like channel settings
- strict `clientSecretEnv` env-var format validation for provider OAuth config
- `security.secretsBackend` pinned to `encrypted-file` (unsupported legacy backend values fail fast)
- strict 32-byte base64 `OPENASSIST_SECRET_KEY` handling (no weak passphrase fallback)
- Unix owner-only permission checks for secret-bearing paths (env file, key material, data/db paths)
- strict onboarding (`setup quickstart`) validates unresolved secret references before save by default
- runtime diagnostic chat replies are sanitized and use categorized error summaries (no raw secret-bearing exception dumps)

### Duplicate side effects after restart

Controls:

- durable idempotency keys
- replay queue semantics
- scheduler keys `scheduler:<taskId>:<scheduledFor>`

### Attachment ingest misuse or media overclaiming

Controls:

- runtime-owned attachment policy enforces bounded file count, image size, document size, and extracted-text length
- persisted attachments live under `runtime.paths.dataDir` with owner-only Unix permissions where the host supports them
- attachment metadata is durable for replay, but image binaries stay out of normal text context
- only providers that declare `supportsImageInputs=true` receive image binaries
- text-only providers get an explicit runtime note when image understanding is unavailable
- unsupported or oversized attachments produce operator-visible notes instead of silent drops

### Outbound delivery misuse or unsolicited operator messaging

Controls:

- staged outbound files are copied into runtime-owned storage before delivery and cleaned up after success or terminal retry failure
- same-chat artifact replies and targeted operator notify share the runtime-owned `channel.send` audit trail instead of adapter-specific hidden sends
- targeted notify requires a specific listed recipient in `channels[*].settings.operatorUserIds`; Discord additionally requires `allowedDmUserIds` overlap before DM delivery is allowed
- runtime awareness, `/status`, `/capabilities`, and `openassist tools status` report when outbound files or targeted notify are unavailable so the model and operator do not overclaim channel reach
- unsupported files, missing staged files, or invalid direct-recipient routes degrade to explicit notes instead of silent drops

### Managed growth misuse or misleading durability claims

Controls:

- runtime awareness and `/grow` make the default growth mode explicit as `extensions-first`
- managed skills and helper tools live under runtime-owned directories instead of tracked repo manifests
- managed growth assets are tracked durably in `managed_capabilities` so lifecycle and operator surfaces can distinguish update-safe extensions from dirty repo changes
- helper registration requires explicit `id`, `root`, `installer`, and `summary` fields
- direct repo mutation remains available only in `full-root`, but runtime/docs surface it as advanced and less update-safe than managed growth
- `openassist doctor` and `openassist upgrade --dry-run` surface managed growth state so operators can see what should survive normal upgrades

### Reasoning/internal-trace leakage to channels

Controls:

- outbound sanitization strips known internal-trace markers

### Profile-memory misuse

Controls:

- global profile memory updates are explicit (`/profile` command) and auditable through message/event persistence
- first-boot lock-in guard requires explicit force confirmation (`/profile force=true; ...`) before profile updates are applied
- first-contact profile prompt is configurable (`runtime.assistant.promptOnFirstContact`) and does not execute host tools
- quickstart now captures the main assistant identity up front and disables the later first-contact reminder by default on quickstart-created installs
- global profile + per-session host context are injected as bounded system context only; no secret env values are injected into profile memory payloads
- per-session host context now includes layered runtime awareness state, but only normalized host/runtime/access/tool metadata is stored
- `session_bootstrap` remains a last-seen chat snapshot, not a permanent per-actor access store

### Chat-memory misuse or cross-actor leakage

Controls:

- rolling chat compaction now stores structured summary state in `session_memory` instead of transcript markers in `messages`
- durable actor memory is scoped to `<channelId>:<senderId>` so one actor's memory is not recalled for another actor or another channel
- post-turn sidecar extraction is bounded, expects strict JSON, and is allowed to fail silently without affecting the visible chat reply
- runtime filters permanent-memory candidates down to conservative `preference`, `fact`, and `goal` categories and rejects secret-like or malformed content before persistence
- `runtime.memory.enabled=false` disables permanent-memory extraction, recall, and `memory.*` tools without disabling rolling session summaries
- `/memory`, `GET /v1/memory/status`, and `openassist memory status` make the current visible summary/memory state inspectable instead of hidden
- `memory.save` and `memory.search` remain `full-root`-only and use the normal audited tool invocation lifecycle

### Clock drift and scheduling errors

Controls:

- durable clock health checks
- operator-visible time status
- configurable NTP policy (`off`, `warn-degrade`, `hard-fail`)
- timezone confirmation gate (when enabled)

### Scheduler abuse

Controls:

- no first-class scheduled shell action in current release
- scheduler action scope limited to prompt and skill actions
- scheduler actor identity in logs (`scheduler:<taskId>`)

### Autonomous tool loop abuse

Controls:

- bounded tool loop rounds via `runtime.toolLoop.maxRoundsPerTurn` (default `12`, bounds `1..24`)
- unknown/invalid tool arguments return structured failures
- tool execution is sequential and durably audited
- blocked actions are visible as `blocked` status (not silent failure)
- unsolicited provider tool calls are ignored when session autonomy is not enabled
- `pkg.install` elevation behavior is explicit (`sudo -n` non-interactive on Unix when required)

### Native web retrieval misuse

Controls:

- `web.search`, `web.fetch`, and `web.run` are gated to `full-root`
- web tooling supports only `http` and `https`; local file and browser schemes are rejected
- redirects, response bytes, result counts, and pages-per-run are capped
- extraction is deterministic HTTP fetch plus HTML/text parsing only; there is no headless browser or JavaScript execution path in this release
- Brave Search API is used only when `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY` is configured; otherwise hybrid mode uses DuckDuckGo HTML fallback or returns structured unavailable guidance
- web fetch/search audit events record backend and URL metadata without storing raw secrets

## Additional Hardening

- loopback bind default
- no WebUI in V1
- Linux systemd service hardening in the default template (`systemdFilesystemAccess = "hardened"`)

## Residual Risks

- skill scripts and managed helper tools run as trusted local code
- `full-root` intentionally permits OpenAssist's highest host-impacting tool profile, but Linux systemd hardening may still narrow the live host-write boundary unless operators explicitly choose unrestricted service mode
- clock-check dependencies (OS utilities / HTTP date sources) may be constrained on hardened hosts
- Windows filesystems do not enforce Unix mode semantics; runtime logs explicit permission-check skip diagnostics there

## Operational Security Notes

- use bare `openassist setup` for first-time setup; use `openassist setup quickstart` when you want the direct strict-validation path without the lifecycle hub
- keep `~/.config/openassist/openassistd.env` at mode `0600` on Unix hosts
- use `openassist policy-set --session <channelId>:<conversationKey> --profile full-root` only for sessions that require autonomous host actions
- use `openassist policy-set --session <channelId>:<conversationKey> --sender-id <sender-id> --profile full-root` when only one approved operator in a shared chat needs elevation
- review `openassist tools invocations` during incident triage and after privileged automation runs
- use `openassist tools status --session <channelId>:<conversationKey> --sender-id <sender-id>` to confirm callable tools, native web mode, and the current Linux service boundary before enabling sensitive sessions
- use `openassist growth status` and `openassist skills list` to review managed extensions or helper tooling before and after privileged changes
- use in-channel `/status` for quick local diagnostics; avoid pasting raw service logs containing secrets into public channels
- when enabling Discord DMs, keep `allowedDmUserIds` narrow and explicit instead of opening DMs broadly

## Modernization compatibility

Model catalog lookup is local and bounded; custom model names do not grant tools, image capabilities, or optional reasoning fields. Provider SDK upgrades preserve policy checks, account/API-key separation, bounded context and attachment handling, and redacted diagnostics. Retired-model repair is an explicit operator configuration change, not credential replacement.

OpenAI and Anthropic OAuth token-exchange failures expose only a sanitized HTTP status or validation error. Upstream response bodies and status text are never included in these errors; malformed token fields are rejected before credentials are stored. Existing callback, PKCE, refresh-token and expiry metadata remain supported.

Current Claude prefix binding is enforced with the documented drop_block control: changed bounded guidance, access-controlled tools or compacted history discard invalid thinking upstream rather than bypassing signature checks. Valid blocks remain opaque and durable; no raw thinking or beta progress display is exposed. Pro reasoning increases possible cost, not privileges.

Responses replay is opaque, provider/model-scoped and bounded to 1 MiB/256 items per message. It stays out of visible replies and does not authorize tools. Anthropic explicit auth disables the alternate ambient SDK credential kind; workspaceId is validated before header construction. OAuth retry compares the failed token to current state to avoid unnecessary rotation after a concurrent refresh.

## Ubuntu regression candidate

Native reminder creation is bounded and atomically deduplicated; prompts receive tools: [] and cannot read credentials or execute host commands. Creation/list/cancellation are scoped to approved full-root actors in the current chat, with execution/delivery reauthorization. Additive durable state and rollback admission prevent old applications abandoning active work. Transport ambiguity is explicit: no exactly-once guarantee and no automatic resend after unknown acceptance. The local daemon API retains its trusted-host boundary; network bind defaults remain loopback.

See the [native reminder contract](../interfaces/scheduler-and-time.md#managed-one-shot-reminders) and [resolution matrix](../testing/ubuntu-live-test-resolution.md).
