# Changelog

All notable changes to OpenAssist are documented in this file.

The format follows Keep a Changelog conventions and this project currently tracks an in-development release line.

## [Unreleased]

### Added

- Outbound channel delivery for generated files plus bounded operator notifications:
  - runtime-owned `channel.send` can now return staged files back through the active Telegram, Discord, or WhatsApp chat instead of only describing a local filesystem path
  - targeted notify delivery now stays bounded to `channels[*].settings.operatorUserIds`, and Discord additionally requires the same recipient in `allowedDmUserIds`
  - outbound delivery reuses the bounded runtime attachment limits, stages files under `runtime.paths.dataDir`, retries through the durable recovery queue, and cleans up staged files after success or terminal retry failure
  - `/status`, `/capabilities`, `GET /v1/tools/status`, and `openassist tools status` now surface outbound file-reply availability, targeted notify availability, and the delivery notes that explain any blocked path

- Advanced branch/PR install tracks for developer testing:
  - `install.sh`, `scripts/install/bootstrap.sh`, and `openassist upgrade` now accept `--pr <number>` alongside the existing `--ref <git-ref>`
  - `install.sh` now fetches the matching branch or PR bootstrap script so installer changes can be tested end to end before merge
  - branch installs remain first-class tracked-branch installs
  - PR installs record `refs/pull/<n>/head` and later `openassist upgrade` now requires an explicit `--pr <n>` or `--ref <target>` instead of silently falling back to `main`
  - lifecycle reporting now labels branch and PR update tracks clearly in bootstrap summaries, `openassist doctor`, and `openassist upgrade --dry-run`

- Separate Codex provider route:
  - added a fourth first-class provider type, `codex`, alongside `openai`, `anthropic`, and `openai-compatible`
  - `openai` now stays the public OpenAI API-key route in operator-facing setup and docs
  - `codex` now stays the public OpenAI account-login route in operator-facing setup and docs
  - quickstart and wizard now present all four provider routes directly instead of treating OpenAI account login as part of the normal `openai` route
  - `openassist auth start|complete|status|disconnect` now supports the separate Codex route cleanly
  - Codex linked-account state is restart-safe and refresh-capable without colliding with OpenAI API-key auth on the same provider instance

- Lifecycle hub and home-state operator layout:
  - bare `openassist setup` is now the primary interactive lifecycle hub for first-time setup, repair, service actions, update planning, and file-location/status review
  - fresh installs now default to home-state operator paths instead of repo-local writable state:
    - `~/.config/openassist/openassist.toml`
    - `~/.config/openassist/config.d`
    - `~/.config/openassist/openassistd.env`
    - `~/.config/openassist/install-state.json`
    - `~/.local/share/openassist/data`
    - `~/.local/share/openassist/logs`
    - `~/.local/share/openassist/skills`
    - `~/.local/share/openassist/data/helper-tools`
  - recognized older repo-local installs (`openassist.toml`, `config.d`, and `.openassist` inside the install directory) now migrate automatically into the canonical home-state layout when the target home paths are empty or compatible, with timestamped backups under `~/.local/share/openassist/migration-backups/`
  - lifecycle reporting is now `version: 2` in `openassist doctor --json`, preserving grouped sections while adding per-item `stage` metadata for shared rendering

- Provider-native reasoning controls:
  - `openassist setup quickstart` now exposes beginner-facing `reasoningEffort` choices for both OpenAI and Codex providers (`Default`, `Low`, `Medium`, `High`, `XHigh`)
  - `openassist setup wizard` now exposes OpenAI `reasoningEffort`, Codex `reasoningEffort`, and Anthropic `thinkingBudgetTokens` (blank to disable)
  - built-in OpenAI adapters now send reasoning effort only on supported Responses API model families
  - built-in Codex adapters now send reasoning effort only on supported Codex Responses-model families
  - built-in Anthropic adapters now send thinking budgets only on supported thinking-capable Claude families
  - Anthropic tool turns now preserve provider replay metadata so thinking-enabled follow-up calls can reconstruct provider-native content blocks without leaking internal reasoning to channels
  - quickstart summaries, wizard summaries, and `openassist doctor` now surface the active primary provider route, model, and reasoning/thinking state

- General-purpose assistant identity and controlled growth:
  - `/start` and `/help` are now runtime-owned OpenAssist welcome surfaces that present OpenAssist as the broader assistant for the machine, not only a repo-maintenance bot
  - `/capabilities` now reports a live capability-domain inventory derived from the active access level, provider, channel, tools, scheduler state, and install context
  - `/grow` now reports the `extensions-first` growth policy, managed skill/helper counts, safe next actions, and update-safety guidance
  - runtime awareness snapshot version `3` now includes capability domains, managed growth state, active channel identity, and a broader machine-assistant grounding pack on every provider turn
  - new host-side growth surfaces:
    - `openassist skills list [--json]`
    - `openassist skills install --path <dir>`
    - `openassist growth status [--json]`
    - `openassist growth helper add --name <id> --root <path> --installer <kind> --summary <text>`
  - new daemon growth endpoints:
    - `GET /v1/skills`
    - `POST /v1/skills/install`
    - `GET /v1/growth/status`
    - `POST /v1/growth/helpers`
  - durable `managed_capabilities` storage now tracks managed skills and helper tools so runtime, CLI, doctor, and upgrade surfaces can distinguish update-safe growth assets from dirty repo edits

- Shared lifecycle readiness reporting:
  - new CLI lifecycle report builder now drives bootstrap summaries, quickstart summaries, wizard recovery wording, `openassist doctor`, and `openassist upgrade --dry-run`
  - `openassist doctor --json` now exposes the same grouped readiness report shape as the human-readable doctor output for scripting and automation

- Linux systemd filesystem access mode:
  - added `[service].systemdFilesystemAccess = "hardened" | "unrestricted"` with a safe default of `hardened`
  - Linux quickstart and wizard now expose the service mode separately from chat access mode and require an extra confirmation before saving unrestricted service access
  - `openassist service install` now reads the configured Linux service mode and rewrites the systemd unit accordingly
  - `/status`, `/access`, `/capabilities`, `GET /v1/tools/status`, `openassist tools status`, setup summaries, and `openassist doctor` now surface the configured and effective Linux service boundary separately from the `full-root` policy boundary
  - shared lifecycle readiness JSON is now `version: 3` because the report context includes Linux service filesystem access

### Changed

- Repo-wide docs/test/CI hardening follow-up:
  - `docs/README.md` now indexes every live non-ExecPlan doc, including the context-engine, config-rollout, and OpenClaw import pages
  - repo-tracked docs now describe GitHub automation using tracked workflow truth, including the separate `CodeQL` workflow and the distinction between normal PR automation versus supplemental manual/scheduled smoke
  - docs-truth enforcement is now broader: it validates all live docs except archived ExecPlans, checks local links plus anchors, verifies docs-index completeness, verifies coverage-threshold wording against `vitest.config.ts` and `package.json`, and verifies workflow wording against `ci.yml`, `codeql.yml`, `service-smoke.yml`, and `lifecycle-e2e-smoke.yml`
  - the lifecycle E2E smoke workflow now checks the current `openassist doctor --json` report `version: 3` instead of the stale `version: 2` expectation that local tests no longer exercised

- Outbound channel delivery follow-up hardening:
  - runtime now blocks and audits provider tool calls that were not actually advertised for the active session, which closes the gap where a provider could force hidden delivery tools in `full-root`
  - `channel.send mode="reply"` now enforces the same outbound-file availability boundary surfaced in runtime awareness instead of relying only on schema exposure
  - Discord and WhatsApp outbound sends now turn missing staged attachments into explicit delivery notes, and WhatsApp now spills caption overflow into a follow-up text message instead of risking delivery failure

- Setup wizard operator-access follow-up:
  - adding approved operator IDs in `openassist setup wizard` while the install is still in standard mode now prompts to enable `Full access for approved operators` immediately instead of leaving filesystem tools workspace-only with no normal-flow warning
  - channel edits in wizard now preserve configured approved operator IDs while applying that prompt logic

- Bootstrap branch-track follow-up:
  - fixed a shell-conditional regression in `scripts/install/bootstrap.sh` so non-interactive bootstrap works again for scheduled lifecycle smoke and real installs on `main`
  - added bootstrap shell-syntax coverage so invalid bash conditionals are caught before merge

- Lifecycle smoke and bootstrap handoff follow-up:
  - non-interactive bootstrap summaries now print the setup handoff command in normal operator form (`openassist setup --install-dir ...`) instead of shell-escaped subcommand text
  - the supplemental lifecycle E2E smoke workflow now uses static workflow env declarations for its temporary HOME/install paths so local editor/schema validation stays aligned with the actual GitHub Actions runtime behavior

- Setup-hub and Codex account-linking UX follow-up:
  - bare `openassist setup` now uses a simple numbered menu instead of the re-rendering select UI that could duplicate or obscure the root lifecycle choices on some terminals
  - Codex quickstart account-linking now pauses after printing the authorization URL so headless VPS installs can copy it before continuing
  - skipping required Codex account linking during quickstart is now reported as an account-linking recovery step instead of a misleading service failure with daemon log spam
  - `openassist auth start --open-browser` now treats missing local browser launchers (for example `xdg-open` on headless hosts) as a non-fatal fallback and keeps the printed authorization URL usable
  - bare `openassist setup` and other non-growth CLI paths no longer print the Node `node:sqlite` experimental warning before the lifecycle hub appears
  - Codex no longer asks for a custom base URL in quickstart or wizard
  - provider setup labels are now harmonized as `OpenAI (API Key)`, `Codex (OpenAI account login)`, `Anthropic (API Key)`, and `OpenAI-compatible`
  - new Codex login starts now use the supported localhost callback `http://localhost:1455/auth/callback`, which fixes the previous browser-side `unknown_error` path caused by the unsupported daemon callback redirect
  - Codex account completion now accepts pasted localhost callback URLs through both quickstart and `openassist auth complete --callback-url ...`, including wrapped or multiline paste artifacts from remote browsers
  - daemon and CLI auth surfaces now report sanitized account-linking failures with safe upstream detail when available instead of collapsing Codex completion into a generic `status=500`
  - Codex and OpenAI reasoning controls now include `xhigh` alongside `low`, `medium`, and `high`

- Fresh Codex quickstart and auth-readiness fix:
  - a true first-run quickstart that selects Codex now replaces the seeded `openai-main` placeholder instead of saving both providers in the resulting config
  - Codex account completion and refresh now use the real Codex/ChatGPT token auth handle as the chat-ready success path; exchanging into a separate OpenAI API key is now optional auxiliary metadata instead of the definition of success
  - `openassist auth status` stays redacted but now surfaces linked-account presence, active auth kind, expiry when known, chat-readiness, and a redacted detail message for account-login routes
  - quickstart now keeps linked-but-unusable Codex auth in the account-linking recovery path instead of silently saving a provider that will fail on the first chat reply

- Codex account-login realignment and device-code support:
  - Codex now follows the current upstream account-login model instead of treating exchanged OpenAI API keys as mandatory for successful login
  - `openassist auth start --provider <provider-id> --device-code` is now the recommended headless/VPS Codex login path, with browser callback/manual paste kept as a fallback
  - runtime no longer consumes OAuth flow state before Codex callback completion actually succeeds, so transient failures can be retried with the same valid state until expiry
  - quickstart, wizard, README, troubleshooting docs, and `AGENTS.md` now describe Codex login as device-code-first for remote hosts and keep browser/manual completion as the fallback path

- Codex chat request-shape fix:
  - the Codex provider now sends the upstream conversation headers expected by the Codex backend, including `session_id` from the runtime session id and `ChatGPT-Account-ID` when account metadata is available
  - Codex no longer uses the generic OpenAI SDK chat-completions fallback path; it now sends direct Codex responses requests that match the account-login route more closely
  - blank-body Codex upstream `400` failures now surface as sanitized provider request errors with safe request ids when available instead of a useless bare `400 status code (no body)` message
  - docs and troubleshooting now make it explicit that linked Codex auth is stored encrypted in SQLite and refreshed automatically when possible, so a chat-ready auth handle plus a failing request should be diagnosed as a provider request issue rather than a missing-auth issue

- Codex chat instructions-contract fix:
  - the Codex provider now sends a required top-level `instructions` field on `/responses` requests instead of relying only on system-role messages inside the normal `input` array
  - those Codex instructions combine an OpenAssist-vendored Codex baseline with the bounded runtime guidance already prepared for the current turn
  - Codex system-role messages are now lifted into `instructions` and removed from the normal input payload so system intent is not duplicated across both surfaces
  - Codex upstream JSON errors that use `detail` now surface as sanitized provider request failures with safe request ids instead of generic provider/runtime wording

- Codex `/responses` contract completion fix:
  - the Codex provider now sends the remaining upstream-aligned `/responses` fields that the live backend requires, including `tool_choice="auto"`, `parallel_tool_calls=true`, `store=false`, and a prompt-cache key derived from the canonical runtime session id
  - Codex no longer sends generic OpenAI-style request extras such as `temperature`, `max_output_tokens`, or metadata fields that are not part of the current linked-account `/responses` contract
  - docs and troubleshooting now make it explicit that chat-ready Codex auth plus a failing chat request is a provider-request issue, not an auth lifecycle issue, while the auth state itself remains encrypted in SQLite and refreshable automatically when possible

- Codex streaming transport completion fix:
  - the Codex provider now keeps `stream=true` on the upstream `/responses` route and folds the returned event stream back into the normal bounded OpenAssist reply contract before channel delivery
  - provider tests now pin both sides of the live contract: required request fields and SSE response parsing, so future Codex drift is caught before merge

- Provider-route docs and samples now describe four equal public routes consistently:
  - OpenAI (API Key)
  - Codex (OpenAI account login)
  - Anthropic (API Key)
  - OpenAI-compatible
  - root `README.md`, root `AGENTS.md`, lifecycle runbooks, provider-interface docs, migration docs, and the sample `openassist.toml` now all treat Codex as Codex-only in this release instead of generic ChatGPT API auth
  - legacy `openai + oauth` configs remain compatibility-only and new account-login guidance now steers operators to `codex`

- Repo-wide docs and test hardening:
  - root `README.md` and root `AGENTS.md` were tightened again as the public/operator and contributor-discipline truth sources
  - added a central troubleshooting runbook at `docs/operations/common-troubleshooting.md` and linked it from the main lifecycle docs
  - `docs/testing/test-matrix.md` now matches the exact on-disk Node/Vitest suite inventory instead of a stale hand-maintained subset
  - normal verification now includes a docs-truth integration test that checks root-doc links, documented CLI command examples, workflow statements, and test-matrix inventory against the real repo
  - added a supplemental manual/scheduled `Lifecycle E2E Smoke` workflow for stronger bootstrap/home-state/doctor/upgrade dry-run validation on Linux and macOS
  - bare `openassist setup` non-TTY guidance now preserves explicit `--install-dir`, `--config`, and `--env-file` values in its printed fallback commands

- Bootstrap setup-hub handoff and installer hygiene:
  - interactive bootstrap no longer tries to pre-seed config through the stale `pnpm ... start -- init --config ...` path before opening the lifecycle hub
  - non-interactive bootstrap still creates a default config before service install, but now does it through the direct `openassist init --config ...` command path
  - bootstrap and install docs now explain the pinned `pnpm` release and WhatsApp/media build-script note in more operator-friendly language
  - the repo, bootstrap, and workflow pins now use `pnpm@10.31.0`

- Provider defaults now keep OpenAI on the current flagship API model `gpt-5.4` and update Anthropic onboarding examples/default prompts to the current Sonnet API model `claude-sonnet-4-6`, so new installs offer current real API model IDs instead of older snapshots or aliases.

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
  - built-in OpenAI, Codex, and Anthropic adapters now map inbound images into provider-native request shapes
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
  - explicit provider account-link guidance in quickstart/wizard for Codex and configured Anthropic providers while OpenAI stays the API-key route
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

- Runtime positioning and growth guidance:
  - provider grounding and `/status` now describe OpenAssist as the broader machine assistant for the host while staying truthful about live provider/channel/tool boundaries
  - runtime awareness, `/grow`, `openassist doctor`, and `openassist upgrade --dry-run` now surface managed growth state, growth directories, and the distinction between durable extensions and dirty repo mutation
  - direct repo/config/code edits remain available only in `full-root`, but runtime/docs now label that path as advanced or developer work rather than the default durable growth path
- Lifecycle readiness follow-up:
  - `openassist doctor` and the final bootstrap summary no longer report a false port-conflict readiness error after successful setup when the healthy daemon is already listening on the configured port

- Lifecycle hub and out-of-repo state follow-up:
  - interactive bootstrap now enters bare `openassist setup` instead of dropping straight into quickstart
  - bootstrap, quickstart, wizard post-save checks, `openassist doctor`, and `openassist upgrade --dry-run` now share one human-readable `Ready now` / `Needs action` / `Next command` shape
  - the repo checkout is now code-first by default, so normal operator config/runtime state no longer makes the install look dirty during upgrade checks
  - upgrade and doctor now distinguish real repo code changes from legacy repo-local operator state and route recognized legacy installs back through `openassist setup` for migration first

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
  - quickstart now requires a review-before-save step and groups repair guidance by operator task (`provider auth`, `channel auth or routing`, `timezone or time`, `service or health`, `access or operator IDs`)
  - `openassist setup wizard` now presents clearer advanced sections for runtime defaults, providers, channels, scheduling, and advanced tools/security
  - `openassist upgrade --dry-run` and live upgrade now print the resolved target plan before mutation, including update method, restart behavior, and rollback target
  - bootstrap, doctor, quickstart, and upgrade now answer lifecycle questions in one consistent order: what is ready now, what still needs action, and which command to run next
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
  - OpenAI/OpenAI-compatible: `gpt-5.4`
  - Anthropic: `claude-sonnet-4-6`
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
