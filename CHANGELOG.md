# Changelog

All notable changes to OpenAssist are documented in this file.

The format follows Keep a Changelog conventions and this project currently tracks an in-development release line.

## [Unreleased]

### Added

- Runtime self-knowledge and identity-restoration pass:
  - runtime awareness is now a richer bounded self-knowledge contract with explicit capabilities, curated local doc references, and repo-backed maintenance/install facts
  - provider turns and `/status` now surface local config path, env-file path, install dir, tracked ref, last known good commit when known, protected lifecycle paths, and safe self-maintenance guidance
  - runtime now carries a curated local docs map so the assistant can cite repo docs such as `README.md`, `docs/security/policy-profiles.md`, `docs/interfaces/tool-calling.md`, and `docs/operations/upgrade-and-rollback.md`
  - quickstart once again asks for the main assistant name, persona, and ongoing objectives/preferences before the first real chat
  - successful quickstart now disables the later first-chat identity reminder by default, while wizard and `/profile` remain the advanced edit paths
  - follow-up hardening now keeps full config/env/install filesystem paths in chat reserved for approved operators, splits protected filesystem paths from descriptive protected lifecycle surfaces, and bounds daemon git install-context probing with a timeout plus warning logs

- First-class channel attachment and presentation path:
  - `AttachmentRef` now carries durable media metadata (`kind`, `mimeType`, `name`, `sizeBytes`, `localPath`, optional `captionText`, optional `extractedText`)
  - `NormalizedMessage.attachments` now survives recent-message replay through durable `message_attachments` storage
  - runtime-owned attachment policy now persists inbound files under `runtime.paths.dataDir`, extracts bounded text from supported text-like documents, and emits visible notes for unsupported or oversized attachments
- First-class channel transport behavior:
  - Telegram now ingests photos and supported documents, keeps private chats/groups/forum topics first-class, and sends HTML-formatted replies
  - Discord now supports guild text channels, thread channels, and explicit DM allow-lists via `channels[*].settings.allowedDmUserIds`
  - WhatsApp MD now ingests images and supported documents, keeps private chats/groups first-class, and sends quoted replies when replying in chat
- First-class provider image capability contract:
  - `ProviderCapabilities.supportsImageInputs` now makes image-input support explicit
  - built-in OpenAI and Anthropic adapters now map inbound images into provider-native request shapes
  - built-in OpenAI-compatible adapters stay text-only for images

- Actor-aware access-mode controls across setup, chat, CLI, API, and runtime:
  - `runtime.operatorAccessProfile` plus per-channel `channels[*].settings.operatorUserIds`
  - canonical session IDs now use `<channelId>:<conversationKey>` for new writes and operator examples
  - shared chats can resolve access per sender with source reporting (`default`, `channel-operator-default`, `session-override`, `actor-override`)
  - provider-independent `/access`, `/access full`, and `/access standard` commands let approved operators change only their own current chat access
  - `openassist policy-set`, `openassist policy-get`, `openassist tools status`, and `GET /v1/tools/status` now accept sender-aware lookup paths
- Layered runtime-awareness contract on every provider turn:
  - bounded awareness snapshot covers OpenAssist software identity, host summary, runtime/session state, session policy/autonomy state, configured vs callable tools, and native web status
  - normalized awareness snapshot is persisted in `session_bootstrap.systemProfile` and refreshed when session profile or runtime tool configuration changes
  - `/status` and `openassist tools status` now expose the same awareness boundary the model sees
- First-class native web tooling owned by the runtime:
  - new `packages/tools-web` package with `web.search`, `web.fetch`, and `web.run`
  - Brave Search API primary backend via `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY`
  - DuckDuckGo HTML fallback in `tools.web.searchMode="hybrid"`
  - bounded HTTP-only extraction with redirect/byte/result/page limits, citations, and final-URL metadata
- Setup wizard native web onboarding:
  - edit `tools.web.enabled` and `tools.web.searchMode`
  - optional env-file capture for `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY`
  - strict validation blocks `api-only` mode when Brave API credentials are absent
- Public governance baseline for open-source release readiness:
  - `SECURITY.md` (private vulnerability reporting workflow via GitHub Security Advisories)
  - `CONTRIBUTING.md` (PR-only contribution flow, verification gates, and engineering discipline)
  - `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1 with maintainer-led enforcement path)
  - GitHub issue/PR templates under `.github/ISSUE_TEMPLATE/` and `.github/pull_request_template.md`
- Dedicated Linux/macOS quickstart runbook for operator and end-user onboarding: `docs/operations/quickstart-linux-macos.md`.
- README quickstart-first structure with explicit operator and end-user startup paths.
- Additional node integration coverage suite for timezone/setup prompt validation branches: `tests/node/cli-prompt-validation-coverage.test.ts`.
- Runtime hardening for autonomous tool loop: unsolicited provider tool calls are ignored when session autonomy is not enabled.
- Regression test coverage for non-`full-root` unsolicited tool-call behavior.
- Runtime tool schema exposure and status reporting now distinguish configured tool families from currently callable tools, which makes `operator`/`restricted` negative capability explicit for both host tools and native web tools.
- Provider requests now include a bounded runtime-awareness system message instead of the previous small host-profile dump.
- Setup-wizard post-save operational validation flow (`service restart` + daemon health + time status + scheduler status checks, with optional service install prompt).
- Bootstrap PATH profile integration for direct wrapper commands (`openassist`, `openassistd`) in shell startup files.
- Setup quickstart and setup wizard post-save recovery actions for failed service/health checks (`retry`, `skip`, `abort`) instead of hard-stop behavior.
- Bootstrap prerequisite recovery loop with interactive retry/manual-fix choices and platform-specific troubleshooting command output.
- Prompt-level setup validation helpers with re-prompt behavior for invalid numeric/timezone/identifier/bind-address inputs in quickstart and wizard flows.
- Setup timezone prompts now use a guided two-step picker (`country/region -> city`) and enforce DST-aware Country/City IANA timezones.
- In-channel runtime diagnostics path (`/status`) that returns local runtime/time/scheduler/channel profile status without provider dependency.
- Channel-visible operational diagnostic replies when provider/auth/runtime failures occur during inbound chat processing.
- Workspace build-script allowlist (`onlyBuiltDependencies`: `esbuild`, `protobufjs`) to avoid install-time approval prompts during bootstrap.
- Setup UX clarity pass:
  - staged quickstart headings with clearer intent text per phase
  - shorter API-key prompts with explicit env-var display to reduce terminal wrapping/truncation risk
  - explicit provider OAuth account-link guidance in quickstart/wizard for OpenAI/Anthropic
  - strict numeric validation for Telegram allowed chat IDs and Discord allowed channel IDs
- Service failure diagnostics in quickstart:
  - automatic service-status and log snippets are printed on failed health checks before prompting retry/skip/abort.
- Assistant profile-memory bootstrap:
  - persistent global assistant memory (`name`, `persona`, `preferences`) for the main/master agent
  - per-session host profile snapshot and first-contact prompt state
  - provider-independent in-chat profile command (`/profile`, `/profile force=true; name=...; persona=...; prefs=...`)
  - optional first-contact prompt on `/start` and `/new` when enabled
- First-boot lock-in guard for global profile memory:
  - global profile updates are blocked by default unless explicit force confirmation is provided in-chat
  - forced updates are tracked with durable lock metadata (`assistant.globalProfileLock`)
- Telegram channel behavior controls:
  - `conversationMode` (`chat` default, optional `chat-thread`)
  - `responseMode` (`inline` default, optional `reply-threaded`)
- Bootstrap git-auth recovery flow:
  - GitHub HTTPS auth failures now offer interactive retry/credential-clear/abort choices instead of immediate hard exit

### Changed

- Channel UX and beginner copy pass:
  - quickstart and wizard no longer describe WhatsApp as experimental on beginner paths
  - quickstart and wizard now describe Telegram, Discord, and WhatsApp as first-class channel choices with clearer guidance for groups, topics, DMs, QR login, and attachment support
  - Discord setup now includes explicit DM allow-list prompts instead of implying DMs are open automatically
  - chat replies, `/status`, and runtime diagnostics now pass through shared channel-aware rendering and chunking so channels receive readable sections instead of dense plain-text walls
- Installer and build-policy alignment for supported media paths:
  - `pnpm-workspace.yaml` now allows the supported WhatsApp/media build-script baseline (`@whiskeysockets/baileys`, `sharp`) alongside existing required build dependencies
  - bootstrap/install docs now explain skipped WhatsApp/media build scripts in supported-path language instead of calling them optional extras

- Beginner-facing access and lifecycle wording pass:
  - quickstart and wizard now present `Standard mode (recommended)` and `Full access for approved operators` instead of forcing raw policy jargon onto new operators
  - quickstart asks `Enable full access for approved operators? [y/N]` after the primary channel is configured and only asks for approved operator IDs on the opt-in path
  - quickstart blocks incomplete full-access setup and offers a clear path back to standard mode instead of failing with schema-style errors
  - `/status` now shows the exact sender ID, canonical session ID, effective access, and access source needed for later operator configuration and troubleshooting
  - bootstrap, doctor, setup summaries, and update output now use plainer operator language and explicitly explain expected `pnpm` notices / optional build-script warnings on normal Telegram and Discord installs
- Lifecycle UX overhaul for install, setup, and update:
  - bootstrap now prints an operator-first lifecycle plan and readiness summary instead of ending with a loose path dump
  - install-state persistence is now normalized across bootstrap, service install, and upgrade so tracked ref, repo metadata, config/env paths, service manager, and last known good commit do not drift
  - `openassist doctor` now reports lifecycle readiness, install-state presence, tracked ref, repo path details, service-manager state, and upgrade readiness in operator language
  - `openassist setup quickstart` now stays focused on first success: one provider, one channel, simple guided timezone confirmation, service health, and a first-reply checklist
  - `openassist setup wizard` now presents clearer advanced sections for runtime defaults, providers, channels, scheduling, and advanced tools/security
  - `openassist upgrade --dry-run` and live upgrade now print the resolved target plan before mutation, including update method, restart behavior, and rollback target
  - lifecycle docs were rewritten around the canonical flow: install -> quickstart -> wizard -> upgrade
  - install and upgrade runbooks now explicitly cover repo-backed checkouts, tracked refs, detached-checkout guidance, first-reply checklists, service-manager behavior, and rerun-bootstrap cases for missing `.git` or missing build output
- CodeQL workflow actions upgraded from `github/codeql-action@v3` to `@v4` to remove deprecation risk while preserving existing required-check job names.
- Dev/test dependency hardening:
  - enforced patched `esbuild` resolution via pnpm override (`esbuild@<=0.24.2 -> 0.25.0`) to close the Vitest/Vite advisory path
  - retained stable Vitest 2 coverage toolchain to preserve existing coverage-gate behavior
- Root documentation flow now prioritizes install -> quickstart -> health checks before deep reference sections.
- Root README command reference was refreshed for first-contact public repo usability.
- Documentation alignment pass:
  - auth-status docs now match current redacted CLI behavior
  - upgrade runbook no longer mentions a non-existent dirty-tree override
  - test-matrix inventory now matches current on-disk test suites
- Security/interface/operations docs synchronized to reflect runtime-side unsolicited tool-call rejection semantics.
- Interface/security/operations docs now describe layered awareness snapshots, native web tool contracts, setup validation for web search mode, and `/status` capability reporting.
- Linux/macOS install and quickstart runbooks now describe automatic PATH profile updates and wizard post-save checks.
- Wizard post-save checks now skip cleanly (with explicit messaging) on unsupported service-manager platforms.
- Ubuntu/Debian bootstrap now installs Node 22 via NodeSource instead of relying on distro `nodejs` versions that can be below minimum.
- Ubuntu/Debian bootstrap now attempts `npm+n` (`n 22`) fallback if NodeSource/distro provisioning still leaves Node below minimum.
- Setup command handling now reports saved-but-aborted post-save checks explicitly (non-zero exit on explicit abort path).
- Setup quickstart/wizard health checks now probe loopback fallback URLs when configured bind address is wildcard (`0.0.0.0`/`::`), reducing false `fetch failed` results.
- Linux service manager selection now supports root-friendly system mode:
  - non-root uses `systemd --user`
  - root uses system-level `systemd`
- Service templates now use the exact Node binary executing setup/bootstrap (`process.execPath`) instead of relying on `/usr/bin/env node`, preventing daemon start failures caused by PATH/version drift.
- Runtime channel startup is now application-wide non-blocking:
  - a slow/hung connector no longer blocks daemon startup or health endpoint availability
  - startup failures remain isolated to connector/module health (`openassist channel status`)
- `openassist auth status` CLI output is intentionally redacted (status endpoint reachability is reported without printing OAuth/API-key payload details).
- Coverage-gate baseline raised:
  - Vitest: lines/statements/functions `>=81`, branches `>=71`
  - Node integration: lines/statements `>=79`, functions `>=80`, branches `>=70`
- Setup quickstart/wizard secret prompts now use masked `*` input feedback and explicit long-value guidance for API keys/tokens.
- OpenAI provider adapter now routes GPT-5/codex-class requests through OpenAI Responses API and auto-falls back from chat-completions on endpoint/model mismatch errors.
- Setup defaults updated to current model baselines:
  - OpenAI/OpenAI-compatible: `gpt-5.2`
  - Anthropic: `claude-sonnet-4-5`
- Node integration coverage branch gate tightened from `>=67` to `>=69` (through `>=68`) while keeping lines/statements/functions gates unchanged.
- OpenAI/OpenAI-compatible provider adapters now encode tool names to provider-safe identifiers and decode them back, fixing runtime failures for dotted internal tool names (for example `exec.run`, `fs.read`) in autonomous sessions.
- Runtime now reconciles tool-call conversation context before each provider turn:
  - drops orphan assistant tool-call entries that no longer have matching tool-result messages
  - drops orphan tool-result rows without a matching tool call in context
  - prevents provider-side failures such as `No tool output found for function call ...` after long autonomous sessions
- Interactive bootstrap now distinguishes local-checkout sync (`Using existing local checkout ...`) from generic in-place updates to reduce first-install confusion when running inside a cloned repo.
- Bootstrap update flow now fetches once and fast-forwards from fetched refs (instead of a second network `git pull`), reducing repeated GitHub HTTPS credential prompts on private repositories.
- Secret backend support is now explicit and deterministic: `security.secretsBackend` accepts only `encrypted-file`; unsupported legacy values fail fast during config load/runtime startup.
- Setup quickstart/wizard and schema validation now reject plaintext secret-like channel settings and require `env:VAR_NAME` references.
- Provider OAuth `clientSecretEnv` now enforces env-var naming format validation.
- Tool invocation request/result payloads are now secret-redacted before persistence and on operator retrieval surfaces.
- macOS launchd service install now sets owner-only permissions on the OpenAssist config directory before env-file security checks, preventing false insecure-permission failures on Unix hosts.

### Security

- Moderate advisory remediation pass:
  - enforced `undici` patched resolution via pnpm override (`undici@<6.23.0 -> 6.23.0`) for Discord transitive dependency chain
  - removed vulnerable Vitest/Vite transitive `esbuild` audit path via targeted pnpm override (`esbuild@<=0.24.2 -> 0.25.0`)
- Dependency advisory remediation baseline:
  - pinned `@whiskeysockets/baileys` to `6.7.21` in WhatsApp channel package to avoid vulnerable transitive graph drift
  - enforced patched `minimatch` resolutions via pnpm overrides (`3.1.4`, `9.0.7`, `10.2.4`)
- CodeQL security hardening pass:
  - replaced shell-based browser launch path on Windows with validated non-shell URL dispatch
  - removed clear-text OAuth/API-key status logging paths from CLI quickstart/auth flows
  - hardened daemon HTTP error responses to avoid returning internal failure details for server errors
  - replaced regex-based output scrubbing paths with deterministic block stripping to avoid ReDoS risk
  - switched file write/create flows in fs/env/secrets helpers to descriptor-based and atomic create patterns
  - closed test-surface quality findings (anchored URL contract assertion and unused import cleanup)
- Removed weak `OPENASSIST_SECRET_KEY` passphrase fallback; key material now requires strict base64-encoded 32-byte secret input when supplied via environment.
- Added Unix owner-only permission enforcement for secret-bearing paths (env file, generated key file, runtime data/DB paths) with explicit diagnostics on hosts without Unix mode semantics.
- OAuth flow PKCE `code_verifier` values are now encrypted at rest with backward-compatible plaintext fallback read for legacy rows.
- Added centralized deep redaction helper and applied it to high-risk structured logs (`audit.exec`, `audit.pkg.install`, tool-call audit paths, send-retry error payloads) to reduce secret leakage risk while preserving audit lifecycle metadata.

## [0.1.0] - 2026-02-24

### Added

- Linux-first local AI gateway runtime with modular providers, channels, skills, and tools.
- CLI lifecycle surfaces: install/bootstrap, setup, service management, upgrade with rollback.
- Time reliability subsystem: clock health, timezone confirmation gate, scheduler with cron/interval and misfire policies.
- Chat-driven autonomous tool loop (V1.4) with policy gating and durable tool invocation audit.

### Security

- Policy profiles with explicit `full-root` activation for autonomous host-impacting actions.
- Guardrail-enabled command execution and audited tool lifecycle states.

### Quality

- Strict local/CI verification gates (`pnpm verify:all`) and enforced coverage thresholds.
- Cross-platform quality workflow matrix plus scheduled/manual service-smoke workflow.
