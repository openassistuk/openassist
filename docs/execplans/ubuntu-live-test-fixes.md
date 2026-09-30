# Fix Ubuntu live-test findings and prepare stable release validation

This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises &
Discoveries, Decision Log, and Outcomes & Retrospective current.

## Purpose / Big Picture

Fix the eight failures observed with packaged 0.2.0-rc.1 on a disposable
Ubuntu host, and make native one-shot text reminders and tool-free prompt
tasks available through chat, CLI, and daemon APIs. An operator must be able
to install through a piped interactive installer without development tools,
finish onboarding with verified activation, and schedule a durable task
without an OS scheduler workaround. The destroyed host is baseline evidence,
not certification of this implementation or stable v0.2.0.

## Progress

- [x] (2026-09-28) Confirmed current main equals origin/main; created `codex/ubuntu-live-test-fixes`. Node 24.21.0 and pnpm 12.5.1 are available.
- [x] Fix installer, onboarding, activation, timezone health, and service PATH.
- [x] (2026-09-28) Implemented installer/lifecycle changes and passed targeted packaged-empty-PATH onboarding, exact default detection, build/instance rejection and activation tests (4 Node tests).
- [x] Correct recurring skip policy with clock-controlled regression tests.
- [x] (2026-09-28) Added and passed clock-controlled cron/interval jitter, year-long outage, restart, repeated DST hour and all misfire-policy tests; clock confirmation preserves all three health states.
- [x] Implement durable one-shot storage, runtime, tool, API, and CLI interfaces.
- [x] (2026-09-28) Interfaces and additive storage compile. Initial one-shot tests pass for timing, deduplication, restart, retries, uncertainty, cancellation, scope denial and rollback admission.
- [x] Cover authorization, timing, replay, cancellation, retry, and ambiguous delivery, including actual runtime cutoff receipts and tool-free scheduled provider requests.
- [x] Update documentation, fixtures, packaged smoke tests, and resolution matrix.
- [x] (2026-09-28) Full local `pnpm verify:all` passed: Vitest coverage 82.93% statements, 73.94% branches, 85.69% functions, 83.98% lines; Node 80.1% statements/lines, 73.38% branches, 86.52% functions. Both dependency audits report zero findings. Subsequent bounded channel-readiness/status changes passed build and 38 targeted tests. Final review and hosted checks remain in progress.
- [x] (2026-09-28) Created [fixes PR #67](https://github.com/openassistuk/openassist/pull/67). Independently inspected review threads (none) and open code-scanning alerts (none).
- [x] (2026-09-28) Corrected implementation `4d33a39` passed local `pnpm verify:all`: 513 Vitest tests passed, one existing skip; Node suites passed. Vitest coverage: 83.08% statements, 74.09% branches, 85.82% functions, 84.08% lines. Node coverage: 80.06% statements/lines, 73.38% branches, 86.52% functions. Both dependency audits report zero findings.
- [x] (2026-09-28) Hosted implementation checks passed for Linux/macOS quality, CodeQL, live macOS LaunchAgent, Linux/macOS x64/arm64 artifacts and signing-contract. The Linux artifact job exercised the published signed rc.1 updater, retained state, candidate activation, active-reminder rollback rejection, completed rollback, recovery and uninstall. Runs: CI `36430059776`, CodeQL `36430059606`, LaunchAgent `36430059559`, artifacts `36430059756`.
- [x] (2026-09-28) Hosted Windows quality also passed for `4d33a39`; all implementation checks are green. This documentation reconciliation records that tested commit. Recheck the final PR head after this documentation-only commit, and require green exact-head checks and review before merge.

## Surprises & Discoveries

Hosted PR #67 checks found two platform-specific issues: macOS Bash 3 treats an empty forwarded-argument array as unset under nounset, and packaged release discovery stopped at a nested pnpm-deploy workspace marker before reaching the build identity/trust anchor. Fix both and retain the actual PTY and signed rc.1 upgrade tests. The 256-task durable limit test exceeded Vitest's five-second default on hosted Windows; give this fsync-heavy test a 60-second timeout without changing product bounds or coverage gates. Final review also moved the clock refresh into confirmTimezone itself and added runtime-level checks for all three clock states.

Existing shell tests assert source text rather than exercising a piped PTY.
The first full verification passed build/lint/typecheck and 506 Vitest tests (one existing skip). Node tests identified an obsolete stdin-redirection assertion and pending docs-index/inventory updates. These are being corrected before the final gate; this is not final verification evidence.
The scheduler applies `skip` to every due occurrence, suppressing normal runs.
The rc.1 updater admits database/config compatibility version 1 only; preserve
that contract through additive storage rather than stranding installed clients.

## Decision Log

2026-09-28: One-shot execution uses additive persisted task and per-part delivery state rather than putting new job types into the existing recurring queue. This keeps old rc.1 recovery workers from claiming unknown jobs. A bounded worker processes at most eight tasks concurrently, persists generation retries, and records explicit uncertainty for sends interrupted before receipt persistence. Channel startup readiness postpones dispatch without discarding intent. This is the same durable retry discipline with a separate bounded state machine.

2026-09-28: The release lifecycle smoke now downloads the signed immutable rc.1 and uses its actual updater to activate the candidate. Portable four-target smoke exercises onboarding under an empty PATH before checking live build/instance finalization. These scripts require hosted Linux/macOS execution; Windows local passes are not substitutes.

2026-09-28: User approved native text and prompt reminders, delivery once after
outage with a late notice, and stable v0.2.0 as the eventual target. Scheduled
prompts retain `tools: []`. No scheduled shell actions are introduced. Work is
single-agent. This PR does not merge, tag, publish, or claim a new live test.

Managed one-shot tasks are separate from TOML recurring tasks. New SQLite
tables preserve database version 1 and existing row shapes. Rollback to builds
without the feature must fail while new work remains nonterminal. Reminder
delivery records must distinguish known success from an ambiguous transport
outcome; ambiguous sends are not blindly retried.

## Outcomes & Retrospective

All eight fixes and native reminder interfaces are implemented with regression coverage. Local verification and all required hosted implementation checks passed; [PR #67](https://github.com/openassistuk/openassist/pull/67) merged on September 28 at `9004841df1038bff77daa1763dfd00312c2509be`. Baseline evidence and reusable settings are in
`docs/testing/2026-09-28-ubuntu-live-test-*` and `docs/testing/default-test-settings.json`.
Only sanitized evidence and synthetic operator identifiers belong in this PR.

The candidate has not been tested on a replacement clean Ubuntu host. The live second-account test remains unverified. Subsequent PRs #68/#69 merged the dependency repair and stable preparation; the maintainer authorized stable publication with the testing gap disclosed. Signed `v0.2.0` was published from `10c1c20` and passed all four native/public-install targets. [The release plan](stable-0.2.0-release.md) records those later gates separately. PR #70 merged publication documentation at `9842237`; its later main audit detected Axios advisories, now addressed in the separate [source repair](post-release-axios-audit-2026-09-30.md). Published packages remain unchanged. Passing automated checks does not certify the unperformed live integration checks.

## Context and Orientation

`install.sh` dispatches file-backed bootstrap scripts. CLI lifecycle helpers
own install state, service generation, setup, and activation checks. Core types
define contracts; config owns validation; storage-sqlite owns durable data;
core-runtime owns policy, scheduler, tool execution, and channel delivery.
The daemon exposes runtime operations, and CLI command registration is in
`apps/openassist-cli/src/main.ts`. Provider adapters remain transport adapters.

## Plan of Work

### Milestone 1: installation and ordinary runtime repair

Move terminal reattachment to a file-backed bootstrap handoff. Add optional
onboarding status to install state, with conservative legacy-seed detection.
Skip source-tool preflight for packaged installs. Share expected-build/instance
activation finalization between setup and explicit recovery and fix dry-run
and doctor guidance. Refresh module health after timezone confirmation. Supply
managed wrappers and the selected Node directory in generated service PATHs.
Acceptance is clean onboarding without Git/npm/pnpm/system Node and consistent
verified lifecycle output without weakening health identity checks.

### Milestone 2: scheduling and durable one-shot work

Fix recurring skip classification with timely tolerance `max(1000ms, 2*tick)`.
Preserve bounded catch-up/backfill and cursor progress over long outages.
Add `scheduler.create/list/cancel`, matching CLI and daemon interfaces, and
managed task status alongside existing recurring tasks. Creation accepts an
offset timestamp or relative delay, anchored to persisted inbound receipt
time (CLI receipt time for host requests). Reject already elapsed new deadlines.
Actions are exact text or provider prompts without tools. Enforce 8000-character
actions, 32 active tasks per actor, 256 per installation, 50 results per list,
and bounded scheduler work. Chat ownership/target comes from runtime context.

Creation and deduplication are transactional. Persist prompt output before
delivery. Persist rendered delivery parts and receipts; never resend recorded
success. Track retryable execution, cancellation, failure, and uncertain send
outcomes. Recheck current approved-operator full access and channel availability
before execution and delivery. Listing/cancelling from chat is actor/session
scoped. Show late delivery with original deadline after downtime. Include
bounded task mutation receipts in the existing tool-limit reply.

### Milestone 3: regression gates and release handoff

Add PTY installer tests, packaged onboarding smoke, lifecycle identity tests,
service PATH checks, clock-health cases, controlled-clock schedule cases, and
durable one-shot failure/replay/ownership tests. Preserve the existing coverage
thresholds. Update root README/AGENTS/changelog, docs index, affected lifecycle,
configuration, channel, interface, security, and testing docs. Provide an
eight-finding resolution matrix with concrete test evidence.

## Concrete Steps

From the repository root, use the pinned Node/pnpm toolchain. Run relevant
Vitest and node:test files while implementing, then `pnpm verify:all`. Record
commands and results below rather than claiming unrun gates. Use the existing
GitHub workflows for Linux/macOS/Windows, CodeQL, live launchd, and four native
artifact/signing targets. Preserve scheduled/manual trigger semantics.

## Validation and Acceptance

Regression tests must fail against the observed old behaviors. Exercise actual
terminal input, absent development executables, wrong build/instance health,
normal and missed scheduler slots, delayed tool creation, duplicate calls,
restarts, cancellation races, revocation, delivery ambiguity, and successful
text/prompt output. Use mocks for provider/channel network calls. Inspect both
stored state and user-visible output. Review all new code for secrets, unsafe
privilege changes, unbounded work, and accidental scope expansion.

## Idempotence and Recovery

Do not overwrite operator state or restore older databases automatically.
Preserve existing config tasks. Managed one-shots must be transactionally
claimed and cancelled; prompt results and delivered parts survive restart.
Do not erase historical evidence or silently retry uncertain sends. Keep
application version at rc.1 until the separate release-preparation PR.

## Artifacts and Notes

The fixes PR will include sanitized baseline evidence, tests, and this plan.
After merge, require a replacement-host packaged retest and rc.1 upgrade test.
Then prepare root/CLI/daemon 0.2.0 versions and `docs/releases/v0.2.0.md` in a
separate release PR. Exact-commit artifacts, protected signing, explicit user
publication approval, and public stable/exact-version installation checks are
release gates, not implied completion of this implementation PR.

## Interfaces and Dependencies

Use existing SQLite, Luxon, cron-parser, provider, renderer, and recovery
capabilities; add no production dependency. Core types carry one-shot action,
request, status, and context contracts. Storage exports bounded transactional
operations. Runtime owns deadline normalization, authorization, execution, and
delivery. Daemon/CLI share those runtime contracts without bypassing modules.

Revision 2026-09-28: initialized from the approved implementation plan and
baseline findings before production edits.

Revision 2026-09-30 final reconciliation: recorded the actual #67 merge and subsequent stable publication/documentation, retained dated implementation checks and unverified live tests, and linked the later Axios source repair without attributing it to immutable packages.
