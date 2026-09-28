# Ubuntu live-test resolution matrix

The September 28, 2026 disposable Ubuntu 24.04 host ran the published rc.1. Its [dated notes](2026-09-28-ubuntu-live-test-notes.md) and [sanitized evidence](2026-09-28-ubuntu-live-test-evidence.json) are baseline observations. Fixtures use synthetic operator IDs. The host was destroyed; no candidate live result is inferred from those observations.

| Finding | Candidate behavior | Regression evidence |
| --- | --- | --- |
| BUG-001 piped installer hangs | Attach terminal input only at the file-backed bootstrap handoff | bootstrap-interactive-contract.test.ts invokes install-pipe-pty.py through real curl and a controlling PTY on Linux/macOS; explicit flags and non-TTY included |
| BUG-002 fresh install selects repair | Pending/complete onboarding marker; conservative exact default-skeleton fallback | cli-live-test-fixes.test.ts checks seeded, customized and invalid config without rewriting it |
| BUG-003 packaged setup needs pnpm | Release preflight uses private Node; source checks remain | cli-live-test-fixes.test.ts completes setup with empty PATH; four-target onboarding-smoke.mjs repeats this inside the artifact |
| BUG-004 activation stays unverified | Matching build and instance required after setup; read-only recovery plans report pending verification | cli-live-test-fixes.test.ts checks mismatches, finalization and dry-run immutability; lifecycle-engine.test.ts covers recovery; artifact smoke finalizes matching live health |
| BUG-005 stale clock degradation | Confirmation refreshes latest clock health | live-scheduler-clock.test.ts preserves healthy/degraded/unhealthy results |
| BUG-006 missing service PATH | Explicit wrapper and selected Node paths in systemd and launchd environments | cli-live-test-fixes.test.ts, service-manager-linux.test.ts and service-manager-macos.test.ts; hosted service checks remain required |
| BUG-007 delayed workaround and tool cutoff | Native durable text/prompt reminders; original receipt deadline; bounded mutation receipts at cutoff | one-shot.test.ts covers persistence, timing, rejection retries, uncertainty, cancellation and authorization; runtime integration and hosted gates required |
| BUG-008 skip suppresses every run | Timely slots execute; old missed slots advance without dispatch | live-scheduler-clock.test.ts checks cron/interval, jitter, long outage, restart, DST and bounded misfires |

Local and hosted outcomes are recorded in the [ExecPlan](../execplans/ubuntu-live-test-fixes.md); a listed test is coverage, not a claim that every hosted gate has passed.

Before merge require pnpm verify:all without lowering thresholds; Linux/macOS/Windows quality, CodeQL preflight and analyze, hosted macOS LaunchAgent, four artifact targets and signing-contract. Inspect unresolved review threads and code-scanning alerts independently of CI.

Before stable preparation, retest a clean replacement Ubuntu host through the public-style pipe with no prerequisite workaround. Repeat chat/file/image/web/memory/access tests, both reminder actions, cancellation, restart recovery, recurring skip, and rc.1 upgrade preserving configuration, credentials, memory and history. The live unapproved second-account test was skipped and remains unverified.

After merge and fresh live results, use a separate PR for root/CLI/daemon stable versions, docs/releases/v0.2.0.md and changelog reconciliation. Build the exact reviewed commit on Linux/macOS x64/arm64. Tagging and protected publication require explicit authorization, followed by stable-channel and exact-version public installation checks.
