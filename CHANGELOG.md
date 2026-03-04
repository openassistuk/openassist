# Changelog

All notable changes to OpenAssist are documented in this file.

The format follows Keep a Changelog conventions and this project currently tracks an in-development release line.

## [Unreleased]

### Added

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
