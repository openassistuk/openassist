# Modernize installation and lifecycle management

This living ExecPlan follows `.agents/PLANS.md`. Implementation is on `codex/lifecycle-modernization`; all work belongs to one PR. Release publication is a separate maintainer operation.

## Purpose / Big Picture

Operators install verified prebuilt releases with a private Node runtime, prepare updates separately, retain a usable previous application, and explicitly uninstall without losing conversations. Contributors retain source installs and can run isolated main/branch/PR/local instances or explicitly switch the primary installation to source and back.

## Progress

- [x] (2026-09-27) Inspected installer, upgrade, services, paths, storage, health, diagnostics, workflows and docs-truth tests; user approved the complete plan and both developer workflows.
- [x] (2026-09-27 19:07Z) Added installation/build contracts, versioned records, isolated state paths, database admission checks and structured build/instance health.
- [x] (2026-09-27 20:45Z) Native artifact/relocation/media/SQLite smoke passed on Linux x64/arm64 and macOS x64/arm64 at b99091d; live Linux update/rollback/uninstall and macOS LaunchAgent gates passed.
- [x] (2026-09-27 20:45Z) Staged operations, compatible rollback, conservative recovery and migration implemented. Phase interruption tests and real WAL-backed state-preservation integration tests pass locally.
- [x] (2026-09-27 20:45Z) Both developer workflows implemented. Source preparation records immutable revisions; foreground local-build integration checks preserve local changes, reuse isolated state, remove inherited credentials and enforce cleanup locks.
- [x] (2026-09-27 20:45Z) Ownership-aware uninstall, cached notices, source checks and release/source/isolation diagnostics implemented. Setup reports matched installation metadata; first service startup can be explicitly health-confirmed.
- [x] (2026-09-27 20:45Z) Documentation synchronized and draft PR #63 opened. Full local verification passed before final reporting refinements, with zero dependency audit findings and unchanged coverage gates.
- [x] (2026-09-27 20:53Z) At b01810430da6055035dc01114f71b9b7fa9a7fe5, full local verification, Linux/macOS/Windows hosted quality, CodeQL, live LaunchAgent, four native artifact targets, signing contract and live Linux source/release round trip passed. Supplemental Linux/macOS workflows passed at 6d8db90.
- [ ] Reconcile final isolated-setup and legacy PR-track guard refinements after their passing targeted tests; retain signing/publication as maintainer rollout prerequisites.

## Surprises & Discoveries

The existing upgrade changes the active checkout and rebuilds on rollback. The database initializes tables without a schema compatibility version. Install-state parsing currently suppresses malformed input. Readiness assumes a Git checkout, and health checks search a response string. These are concrete boundaries to replace together.

2026-09-27: Source dry-run regression tests exposed omitted prerequisite/dirty-checkout checks. Reusing the existing readiness renderer restored all 13 applicable tests in the three source lifecycle integration suites (one Windows platform skip). `pnpm build` passes. The first coverage run measured 69.64% branches against the unchanged 71% gate; additional behavior coverage is required. Full verification is not yet green.

2026-09-27: Shell filename listing cannot validate archive link topology. Bootstrap now authenticates a separately compressed private runtime and a bundled verifier, then uses the same bounded archive validator as installed updates. No application archive is extracted by system tar. The verifier is bundled at build time with esbuild; tar remains the production parser.

2026-09-27 19:28Z: Native portable artifacts now pass on Linux arm64 and both macOS architectures, and the existing live LaunchAgent gate passes. Linux x64 portable startup passed, but the new live systemd test exposed that PrivateTmp hides test state under `/tmp` and that hardened units need explicit access to the configured home-state directories. The test now uses a real root-owned home layout; units retain hardening and add the configured data/logs/skills paths. These changes await hosted reconciliation.

2026-09-27: The dependency security regression gate rejected esbuild 0.25.12; the explicit build dependency now uses the repository's patched floor 0.28.1. No security override or coverage threshold was relaxed. Source-level config fixture imports also unintentionally widened the Node coverage report; fixtures now use the built config package, matching the CLI's package boundary and documented Node coverage scope.

2026-09-27: CLI tests caught parent/subcommand flag inheritance for `update recover --dry-run --json`; subcommands now use Commander's combined options. Source main/PR dry-run compatibility, signed metadata, unsafe archives, identity mismatches, interrupted phases, private backups, ownership changes, notice caching and immutable source preparation have targeted regression coverage.

## Decision Log

2026-09-27: Use prebuilt Linux glibc/macOS x64/arm64 artifacts with Node 24.21.0 and pnpm 12.5.1 for builds. Keep Windows quality coverage but do not claim Windows lifecycle parity. Use RSA/SHA-256 signed manifests with pinned release keys and fail closed until keys/releases are provisioned. Never generate a production private key in the repository.

2026-09-27: Preserve normal config/data paths and introduce a separate managed application root. Source selectors remain explicit and backwards compatible. Isolated state is not a sandbox for untrusted code. Never automatically restore databases after a failed upgrade.

## Outcomes & Retrospective

The implementation is available in PR #63 on `codex/lifecycle-modernization`. The complete hosted matrix passed at b018104, including actual immutable source preparation and return to a packaged release with live systemd. Local Node coverage was 81.43% lines/statements, 70.97% branches and 89.93% functions; both dependency audit reports contained zero findings. No release has been published and no live operator installation has been changed. The production trust anchor remains deliberately unprovisioned, so publication readiness requires maintainer signing-key/protected-environment setup and a tested preview rollout.

## Context and Orientation

`apps/openassist-cli/src/commands` owns commands; its `lib` directory owns lifecycle orchestration. `packages/config/src/operator-paths.ts` centralizes state locations. `packages/core-types` holds contracts only. `packages/storage-sqlite` owns database compatibility. `apps/openassistd` serves health and passes install context to runtime self-knowledge. `scripts/install/bootstrap.sh` currently implements source bootstrap. Services are generated by the CLI service-manager library. Tests use Vitest for library behavior and Node integration tests for command paths, shell contracts, and docs truth.

## Plan of Work

First add shared build/release/installation contracts, application-state-root paths, strict versioned install records, build identity and storage compatibility. Build portable CLI and daemon deployments with production dependencies, runtime assets and private Node, then sign manifests only in protected release jobs. Verify portable startup independently of checkout and package caches.

Next implement a CLI lifecycle engine that resolves immutable targets, locks the install, writes an operation journal, prepares candidates, validates compatibility, stops the owned service, backs up stopped state, switches the current pointer, verifies the expected identity, and commits state. Keep the previous application available without rebuilding. Recover interrupted operations without guessing from stale PIDs. Block incompatible schema transitions instead of silently restoring old conversations.

Expose update/check/recover/notifications, rollback and uninstall, preserve upgrade flags and source bootstrap selectors, and route setup through the same commands. Source builds use managed staging and retain the original checkout. Isolated dev instances use their own config, env, database, logs, skills and port, run in the foreground, never copy credentials, and never install a primary service. Add dev list/remove and local-working-tree testing.

Finally update release/source/instance diagnostics and all affected documentation. Add release-maintenance, uninstall and developer guides. Update README, AGENTS, CHANGELOG, docs index, lifecycle/configuration/security/architecture/interface/test guides and affected provider/channel/import examples. Extend docs-truth command inventory and report-version assertions. Preserve historical evidence.

## Concrete Steps

From the repository root, run `pnpm build`, targeted Vitest and Node tests after each milestone, then `pnpm verify:all`. Run package smoke tests on native Linux/macOS architectures in hosted jobs. Keep existing quality, CodeQL and live LaunchAgent gates. Add artifact and live Linux lifecycle checks without changing scheduled/manual smoke triggers. Commit independently reviewed milestones, push the branch, and create a PR with exact validation evidence.

## Validation and Acceptance

Prove a release starts with Git/pnpm/system Node absent from PATH, survives relocation, and loads SQLite/provider/channel/media modules. Test bad signatures/hashes/archives, unsupported platforms, interrupted operations, locks, wrong-process health, failed preparation, offline rollback, unverified restart skips, compatible and incompatible databases, preserved credentials/state, custom paths, source selectors, isolated instance ports and credentials, safe/idempotent uninstall, notification caching, and clean JSON output. Preserve coverage gates and dependency audits. No successful test may rely on a published release or production signing secret.

## Idempotence and Recovery

Managed state uses atomic writes and operation locks. Activation journals persist before side effects. Recovery retains current/previous/pending application directories and backups. Uninstall only removes owned paths with containment checks. Unknown custom paths remain for manual review. Primary state is never used by tests. Publication waits for protected signing setup and explicit maintainer action.

## Artifacts and Notes

Initial evidence: clean `main` checkout; authenticated GitHub CLI; existing toolchain is Node 24/pnpm 12.5.1. Local host is Windows, so Linux/macOS operator certification requires hosted runs.

## Interfaces and Dependencies

Public interfaces are `update [check|recover|notifications]`, compatible `upgrade`, `rollback`, `uninstall`, and `dev [test|list|remove]`. Release selectors are `--release`, `--channel stable|preview`, `--version`; source selectors are `--source`, `--ref`, `--pr`. Lifecycle operations accept dry-run/JSON; destructive or method-changing unattended operations require explicit selection and `--yes`. Install records become versioned; lifecycle report becomes version 4. Health adds build and instance identity. Use Node built-ins, tar for bounded archive validation, and esbuild for the standalone bootstrap verifier. Bootstrap uses curl, gzip and OpenSSL.

Revision 2026-09-27: Created the execution record from the user-approved plan before implementation.

Revision 2026-09-27 20:45Z: Recorded native and local integration evidence, updated completed milestones, and added real-artifact test-key signing plus final setup/health reporting checks. The legacy source bootstrap remains an explicit compatibility entrypoint for the first checkout; it refuses managed installations, whose later updates all use the staged engine. CodeQL identified cache stat/read races, now replaced with bounded descriptor reads. Its downloader finding concerns intentional nonsecret version/ref selectors; the narrow suppression documents that no credentials or file contents are transmitted.

Revision 2026-09-27 20:53Z: Reviewed the complete implementation/docs diff and recorded successful CI run 36345718587, release/signing/live-source run 36345718604, CodeQL run 36345718527 and macOS live run 36345718531 at b018104. Supplemental Service Smoke run 36345470771 and Lifecycle E2E run 36345472456 passed on both platforms at 6d8db90. Final review corrected isolated setup to invoke its own candidate CLI/runtime and made legacy PR bootstrap require an explicit target; the 16 targeted lifecycle/docs tests and three bootstrap contracts passed. Default release bootstrap now also explains an unavailable trust anchor without fallback.

Revision 2026-09-27 20:57Z: The final full-suite rerun exposed a collision between a simulated lifecycle test's fixed port 3344 and another suite. The production exclusive-state check correctly refused activation. Lifecycle fixtures now allocate separate ephemeral ports; all 448 Vitest tests pass together. No product safety check or coverage threshold was relaxed.
