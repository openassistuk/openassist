# Modernize installation and lifecycle management

This living ExecPlan follows `.agents/PLANS.md`. Implementation is on `codex/lifecycle-modernization`; all work belongs to one PR. Release publication is a separate maintainer operation.

## Purpose / Big Picture

Operators install verified prebuilt releases with a private Node runtime, prepare updates separately, retain a usable previous application, and explicitly uninstall without losing conversations. Contributors retain source installs and can run isolated main/branch/PR/local instances or explicitly switch the primary installation to source and back.

## Progress

- [x] (2026-09-27) Replace record-derived update URLs with fixed public discovery, constrain downloader destinations and redirects, preserve release/source tracks, and add request-boundary tests and operator/contributor documentation. Full local `pnpm verify:all` passes; unauthenticated built-client reads resolve main and PR #63 through the fixed refs endpoint.
- [ ] (2026-09-27) Reopen alert #40, run full local and hosted verification, and require an actual fixed analysis result without a dismissal or suppression.

- [x] (2026-09-27) Security follow-up implementation and local verification: shared validation, request-boundary regressions, suppression removal and docs are complete; 43 focused tests, CLI typecheck, diff review and full `pnpm verify:all` pass with zero dependency findings.
- [x] (2026-09-27) Implementation commit 1e2ab77b8f956f8f384798d5aa208d71c6d2bd78 passes all hosted gates. Alert #40 is explicitly dismissed as a reviewed false positive and its thread is resolved; API checks report zero open PR alerts and zero unresolved threads.

- [x] (2026-09-27) Inspected installer, upgrade, services, paths, storage, health, diagnostics, workflows and docs-truth tests; user approved the complete plan and both developer workflows.
- [x] (2026-09-27 19:07Z) Added installation/build contracts, versioned records, isolated state paths, database admission checks and structured build/instance health.
- [x] (2026-09-27 20:45Z) Native artifact/relocation/media/SQLite smoke passed on Linux x64/arm64 and macOS x64/arm64 at b99091d; live Linux update/rollback/uninstall and macOS LaunchAgent gates passed.
- [x] (2026-09-27 20:45Z) Staged operations, compatible rollback, conservative recovery and migration implemented. Phase interruption tests and real WAL-backed state-preservation integration tests pass locally.
- [x] (2026-09-27 20:45Z) Both developer workflows implemented. Source preparation records immutable revisions; foreground local-build integration checks preserve local changes, reuse isolated state, remove inherited credentials and enforce cleanup locks.
- [x] (2026-09-27 20:45Z) Ownership-aware uninstall, cached notices, source checks and release/source/isolation diagnostics implemented. Setup reports matched installation metadata; first service startup can be explicitly health-confirmed.
- [x] (2026-09-27 20:45Z) Documentation synchronized and draft PR #63 opened. Full local verification passed before final reporting refinements, with zero dependency audit findings and unchanged coverage gates.
- [x] (2026-09-27 20:53Z) At b01810430da6055035dc01114f71b9b7fa9a7fe5, full local verification, Linux/macOS/Windows hosted quality, CodeQL, live LaunchAgent, four native artifact targets, signing contract and live Linux source/release round trip passed. Supplemental Linux/macOS workflows passed at 6d8db90.
- [x] (2026-09-27 21:04Z) Final implementation f0f5c8199cce184bf2c14f457878251edab82956 passed full local verification and every hosted PR gate. The final reconciliation below records exact runs, coverage and publication prerequisites.

## Surprises & Discoveries

2026-09-27 catalogue verification: hosted analysis 1848168855 marks reopened alert #40 fixed, but reports #41 (`js/http-to-file-access`) for a catalogue version written into the notification cache. Although this was only advisory data in a fixed private file, the cache does not need server-supplied strings. The final design persists only the local status/freshness contract and keeps discovered versions/commits transient. No suppression or dismissal is used for either finding. The first catalogue implementation passed all hosted platform gates at 01dd6b2.

2026-09-27 catalogue redesign: GitHub's documented `/git/matching-refs/` endpoint returns all reference namespaces without a selector; a live read returned 65 refs, including main and PR heads. This avoids adding a service, Git subprocess or bespoke protocol parser for discovery. The existing downloader only enforced HTTPS, so redirect destinations also need a shared enforcement boundary. Annotated tags require commit resolution from GitHub's paginated tags catalogue, rather than confusing a tag-object hash with a commit.

2026-09-27 security follow-up: GitHub's latest analysis still contained alert #40 and its unresolved thread despite a passing CodeQL check and the inline lgtm comment. The SARIF traces installation-record version/ref fields to GitHub URLs, not credentials/config bodies. A focused regression reproduced a separate missing validation step: malformed persisted refs were sent to the source lookup endpoint. The new shared validator rejects them before HTTP or Git activity. Other PR findings (29–39) were already fixed.

The existing upgrade changes the active checkout and rebuilds on rollback. The database initializes tables without a schema compatibility version. Install-state parsing currently suppresses malformed input. Readiness assumes a Git checkout, and health checks search a response string. These are concrete boundaries to replace together.

2026-09-27: Source dry-run regression tests exposed omitted prerequisite/dirty-checkout checks. Reusing the existing readiness renderer restored all 13 applicable tests in the three source lifecycle integration suites (one Windows platform skip). `pnpm build` passes. The first coverage run measured 69.64% branches against the unchanged 71% gate; additional behavior coverage is required. Full verification is not yet green.

2026-09-27: Shell filename listing cannot validate archive link topology. Bootstrap now authenticates a separately compressed private runtime and a bundled verifier, then uses the same bounded archive validator as installed updates. No application archive is extracted by system tar. The verifier is bundled at build time with esbuild; tar remains the production parser.

2026-09-27 19:28Z: Native portable artifacts now pass on Linux arm64 and both macOS architectures, and the existing live LaunchAgent gate passes. Linux x64 portable startup passed, but the new live systemd test exposed that PrivateTmp hides test state under `/tmp` and that hardened units need explicit access to the configured home-state directories. The test now uses a real root-owned home layout; units retain hardening and add the configured data/logs/skills paths. These changes await hosted reconciliation.

2026-09-27: The dependency security regression gate rejected esbuild 0.25.12; the explicit build dependency now uses the repository's patched floor 0.28.1. No security override or coverage threshold was relaxed. Source-level config fixture imports also unintentionally widened the Node coverage report; fixtures now use the built config package, matching the CLI's package boundary and documented Node coverage scope.

2026-09-27: CLI tests caught parent/subcommand flag inheritance for `update recover --dry-run --json`; subcommands now use Commander's combined options. Source main/PR dry-run compatibility, signed metadata, unsafe archives, identity mismatches, interrupted phases, private backups, ownership changes, notice caching and immutable source preparation have targeted regression coverage.

## Decision Log

2026-09-27 status cache: put the versioned `UpdateCheckCache` contract in core-types and validate/project its fields in config. Cache local timestamp, enumerated availability and explicit-target boolean only. Preserve 24-hour caching and offline status while making cached notices generic; explicit checks still return fresh target details. Ignore legacy caches and never treat cache content as installation metadata. This eliminates unnecessary persistence of untrusted discovery text rather than encoding it or teaching the scanner to ignore it.

2026-09-27 catalogue redesign supersedes the dismissal approach: separate bounded HTTPS transport (`lifecycle-download.ts`), public metadata discovery/local target selection (`update-discovery.ts`), and signed preparation (`release.ts`). Discovery never interpolates a local version/ref into a request. Use a fixed latest-stable endpoint, bounded release pages for previews/pins, the fixed complete refs endpoint for source, and bounded tag pages when annotated tags need peeling. Already-installed immutable commit tracks are compared locally. Only explicit preparation downloads the selected signed manifest/application. Notices are advisory public metadata; compatibility remains checked during signed preparation. Enforce exact GitHub repository routes, approved artifact CDN hosts, HTTPS, no URL credentials/nondefault ports/fragments, and per-hop redirect checks. No new dependencies, service, scanner customization or silent target fallback.

2026-09-27 security follow-up: Reuse one source-ref validator for CLI selectors, recorded tracks, source preparation and update notices. Preserve the supported selector character set, reject newline/query/URL payloads without echoing input, and retain the existing unavailable-notice behavior. Remove the ineffective inline suppression. Treat the remaining intentional public-selector data flow as a reviewed false positive only after request-boundary tests and hosted analysis, rather than claiming its disappearance from a green check.

2026-09-27: Use prebuilt Linux glibc/macOS x64/arm64 artifacts with Node 24.21.0 and pnpm 12.5.1 for builds. Keep Windows quality coverage but do not claim Windows lifecycle parity. Use RSA/SHA-256 signed manifests with pinned release keys and fail closed until keys/releases are provisioned. Never generate a production private key in the repository.

2026-09-27: Preserve normal config/data paths and introduce a separate managed application root. Source selectors remain explicit and backwards compatible. Isolated state is not a sandbox for untrusted code. Never automatically restore databases after a failed upgrade.

## Outcomes & Retrospective

The user requested removal of the underlying file-to-network flow after the initial reviewed dismissal. Catalogue redesign is now in progress; historical dismissal evidence below does not establish completion of this new work.

The implementation passes 57 focused Vitest tests, seven Node lifecycle integration tests and full local `pnpm verify:all`, including unchanged coverage gates and zero findings in both dependency audits. Node coverage is 81.64% lines/statements, 71.99% branches and 90.12% functions. New discovery adds no runtime dependency and works without Git or a signing key for advisory notices. Actual release preparation continues requiring the signed manifest. Live unauthenticated built-client reads resolve main and PR #63 through the fixed refs endpoint. Hosted scanner evidence remains pending; alert #40 and its thread have been reopened, with the dismissal removed.

The status-cache refinement passes 58 focused tests and full local `pnpm verify:all` with zero findings in both dependency audits. Node coverage is 81.66% lines/statements, 71.96% branches and 90.12% functions. The earlier numbers describe 01dd6b2, not this final refinement. Hosted completion requires both #40 and #41 to be fixed with zero open PR alerts.

Security follow-up is complete at implementation commit 1e2ab77b8f956f8f384798d5aa208d71c6d2bd78. Node coverage is 81.44% lines/statements, 70.98% branches and 89.95% functions; Vitest coverage is 83.30% lines, 82.36% statements, 72.31% branches and 85.20% functions. All 451 Vitest tests and the Node suites pass, with zero findings in either dependency audit. The malformed-ref regression fails before the patch and passes afterwards without calling HTTP or Git; valid source and release lookups still pass. The earlier green-check evidence did not establish zero open alerts; the API reconciliation below now records their actual disposition.

Implementation, documentation, tests, native packaging and recovery validation are complete in PR #63 on `codex/lifecycle-modernization`. The complete hosted matrix passed at f0f5c81, including actual immutable source preparation and return to a packaged release with live systemd. Final local Node coverage was 81.43% lines/statements, 70.98% branches and 89.93% functions. Vitest measured 83.24% lines, 82.29% statements, 72.14% branches and 85.18% functions. Both dependency audit reports contained zero findings. No release has been published and no live operator installation has been changed.

Publication readiness is separate from implementation readiness. The production trust anchor remains deliberately unprovisioned. Maintainers must commit the RSA public key, configure the protected signing secret/environment and publishing controls, prepare matching version/tag metadata, and validate a preview before stable publication. Until then, normal release bootstrap fails closed and explicit source installation remains available. Windows results certify development/CI behavior only.

## Final Merge and Check Reconciliation

Security follow-up supersedes the earlier implementation reconciliation below. The exact reviewed code commit is 1e2ab77b8f956f8f384798d5aa208d71c6d2bd78. `pnpm verify:all`, CLI typecheck, 43 focused lifecycle tests and diff review pass locally. [CI 36350135733](https://github.com/openassistuk/openassist/actions/runs/36350135733) passes Linux/macOS/Windows quality and workflow lint. [CodeQL 36350135755](https://github.com/openassistuk/openassist/actions/runs/36350135755), [live LaunchAgent 36350135736](https://github.com/openassistuk/openassist/actions/runs/36350135736), and [four-target artifacts/signing 36350135748](https://github.com/openassistuk/openassist/actions/runs/36350135748) pass. Publication is intentionally skipped. This evidence records the code commit; the following reconciliation edit is documentation only.

CodeQL analysis 1848105659 (PR merge commit 30bf5546fca0e9e4d9820aa3fc9a002aca75dd34) reports only the intentional installation-record selector flow to GitHub. [Alert #40](https://github.com/openassistuk/openassist/security/code-scanning/40) was dismissed with reason `false positive`, with the reviewed commit and tests in the dismissal record; its review thread is resolved. Alerts 29–39 remain fixed. Explicit API reads after dismissal report zero open alerts on `refs/pull/63/merge` and zero unresolved PR review threads. This is an explicit disposition, not a claim that the generic static warning was code-remediated. No scanner rule or threshold was disabled. Release signing-key provisioning and publication remain the separate maintainer prerequisites described above.

The complete code/docs diff was reviewed against `main`; `git diff --check origin/main` passed and no unrelated edits, embedded credentials or production private keys were found. The exact final implementation reviewed and tested is f0f5c8199cce184bf2c14f457878251edab82956. This reconciliation is a documentation-only follow-up; the PR has not been merged.

`pnpm verify:all` passed locally on Node 24.21.0/pnpm 12.5.1, including workflow lint, builds, lint/type checks, the full Node/Vitest suites, unchanged coverage gates and both dependency audits. The local host is Windows; native release/service proof comes from hosted jobs, not simulated host tests.

[CI run 36346229618](https://github.com/openassistuk/openassist/actions/runs/36346229618) passed Linux/macOS/Windows quality and workflow lint. [CodeQL run 36346229598](https://github.com/openassistuk/openassist/actions/runs/36346229598) and the CodeQL alert gate passed. [macOS live run 36346229621](https://github.com/openassistuk/openassist/actions/runs/36346229621) passed the required LaunchAgent gate. [Release run 36346229745](https://github.com/openassistuk/openassist/actions/runs/36346229745) passed all four native artifacts, live Linux activation/rollback/recovery/source switching and test-key signing; publication was skipped as intended.

The supplemental [Service Smoke run 36346102535](https://github.com/openassistuk/openassist/actions/runs/36346102535) and [Lifecycle E2E run 36346104068](https://github.com/openassistuk/openassist/actions/runs/36346104068) passed Linux/macOS at 48930b8, whose product code is identical to f0f5c81. The only intervening change allocated independent ports in test fixtures and recorded that correction. No merge or live provider/channel certification is inferred from these results.

## Context and Orientation

`apps/openassist-cli/src/commands` owns commands; its `lib` directory owns lifecycle orchestration. `packages/config/src/operator-paths.ts` centralizes state locations. `packages/core-types` holds contracts only. `packages/storage-sqlite` owns database compatibility. `apps/openassistd` serves health and passes install context to runtime self-knowledge. `scripts/install/bootstrap.sh` currently implements source bootstrap. Services are generated by the CLI service-manager library. Tests use Vitest for library behavior and Node integration tests for command paths, shell contracts, and docs truth.

## Plan of Work

For the catalogue redesign, first extract the existing bounded downloader into `apps/openassist-cli/src/lib/lifecycle-download.ts`, keep its re-export from `release.ts` for compatibility, and enforce destinations on the initial request and every redirect. Add `update-discovery.ts` for fixed GitHub release/ref/tag catalogue fetching with local selection, a shared ten-second discovery deadline, ten pages of 100 release/tag entries with at most 2 MiB per page, and a complete refs response limited to 4 MiB/10,000 entries. Missing, malformed, ambiguous or truncated results must not imply a healthy/up-to-date installation. Resolve only metadata received from GitHub into later download paths; saved selectors remain local comparison inputs. Preserve the latest-stable definition and exact pins. Use the existing installed commit to identify pinned source revisions; resolve mutable branch/PR/lightweight/annotated-tag tracks from public catalogues. Test request URLs, privacy, bounds, missing/old selections, and redirect escapes, update lifecycle/security/architecture/test docs, then reopen and verify alert #40 through hosted CodeQL.

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

Revision 2026-09-27 security follow-up: Reopened the verification record after discovering alert #40 remained open. Added regression coverage and shared source-selector validation, and corrected the interpretation of the historical suppression/green CodeQL evidence. All local/hosted checks pass at 1e2ab77. Recorded the false-positive disposition separately from the fixed validation gap and verified zero remaining open PR alerts or review threads.
