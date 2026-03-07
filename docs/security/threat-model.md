# Threat Model

This document covers OpenAssist local-first single-operator deployments.

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

- provider API keys and OAuth tokens
- channel credentials
- local filesystem integrity
- conversation and scheduler run history
- global assistant profile memory (`system_settings` / `assistant.globalProfile`) plus per-session host bootstrap context (`session_bootstrap`)
- access assignments (`policy_profiles`, `actor_policy_profiles`, approved operator channel settings)

## Threats and Controls

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
- `/status` exposes the current sender ID, canonical session ID, effective access, and access source so operators do not need to guess identity formats
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

- bounded tool loop rounds (default `8`)
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
- service hardening in systemd template

## Residual Risks

- skill scripts and managed helper tools run as trusted local code
- `full-root` profile intentionally permits unrestricted host impact
- clock-check dependencies (OS utilities / HTTP date sources) may be constrained on hardened hosts
- Windows filesystems do not enforce Unix mode semantics; runtime logs explicit permission-check skip diagnostics there

## Operational Security Notes

- use `openassist setup quickstart` for first-time setup to enforce strict validation gates
- keep `~/.config/openassist/openassistd.env` at mode `0600` on Unix hosts
- use `openassist policy-set --session <channelId>:<conversationKey> --profile full-root` only for sessions that require autonomous host actions
- use `openassist policy-set --session <channelId>:<conversationKey> --sender-id <sender-id> --profile full-root` when only one approved operator in a shared chat needs elevation
- review `openassist tools invocations` during incident triage and after privileged automation runs
- use `openassist tools status --session <channelId>:<conversationKey> --sender-id <sender-id>` to confirm callable tools and native web mode before enabling sensitive sessions
- use `openassist growth status` and `openassist skills list` to review managed extensions or helper tooling before and after privileged changes
- use in-channel `/status` for quick local diagnostics; avoid pasting raw service logs containing secrets into public channels
- when enabling Discord DMs, keep `allowedDmUserIds` narrow and explicit instead of opening DMs broadly
