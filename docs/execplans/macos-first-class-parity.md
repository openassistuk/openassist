# macOS first-class operator parity

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [`.agents/PLANS.md`](../../.agents/PLANS.md).

## Purpose / Big Picture

OpenAssist already has real macOS support in bootstrap, setup, service management, and CI, but parts of the shared docs and regression net still frame Linux as the only truly first-class operator path. After this change, Linux and macOS will be presented and validated as equal supported operator paths for the installed lifecycle, while Linux-only `systemd` behavior remains explicitly Linux-only and Windows stays out of scope for service-parity work.

The user-visible result is a parity pass rather than a new feature: the installed lifecycle docs, architecture/testing guidance, contributor rules, and regression tests all become consistent with the existing `launchd` implementation and hosted macOS CI coverage.

## Progress

- [x] (2026-03-20 14:10+00:00) Created branch `feat/macos-first-class-parity`.
- [x] (2026-03-20 14:10+00:00) Audited the current Linux/macOS code, docs, workflow, and test surfaces to identify real parity gaps instead of assuming missing support.
- [x] (2026-03-20 14:15+00:00) Patched shared docs, contributor rules, and release notes so Linux and macOS are both treated as first-class supported operator paths while Linux-only systemd behavior stays explicit.
- [x] (2026-03-20 14:15+00:00) Strengthened regression coverage for launchd-aware setup/lifecycle behavior, bootstrap/install contracts, and docs-truth wording.
- [x] (2026-03-20 14:15+00:00) Fixed a real macOS truthfulness bug in `apps/openassist-cli/src/lib/setup-summary.ts`: quickstart summaries now pass `launchd` into the lifecycle report builder on darwin so the saved service-boundary line reports `Not applicable on launchd` instead of a generic unconfirmed Linux message.
- [x] (2026-03-20 14:23+00:00) Ran focused validation for touched surfaces:
  - `pnpm exec vitest run tests/vitest/setup-quickstart-validation.test.ts`
  - `node --test --import tsx/esm tests/node/cli-docs-truth.test.ts`
  - `node --test --import tsx/esm tests/node/cli-setup-validation-coverage.test.ts`
  - `node --test --import tsx/esm tests/node/install-bootstrap-idempotence.test.ts`
- [x] (2026-03-20 14:27+00:00) Ran the full local gate with `pnpm verify:all`; workflow lint, build, lint, typecheck, Vitest, Node tests, and both coverage suites all passed.
- [x] (2026-03-20 14:31+00:00) Committed the parity pass as `a772cc6` (`feat: harden macOS operator parity`), pushed `feat/macos-first-class-parity`, and opened PR [#44](https://github.com/openassistuk/openassist/pull/44) with title `feat: make macOS a first-class supported operator path`.
- [x] (2026-03-20 14:32+00:00) Manually dispatched the supplemental hosted smoke workflows on the PR branch:
  - `service-smoke.yml`: <https://github.com/openassistuk/openassist/actions/runs/23347135534>
  - `lifecycle-e2e-smoke.yml`: <https://github.com/openassistuk/openassist/actions/runs/23347136062>
- [x] (2026-03-20 14:33+00:00) Required PR checks and a fresh pair of supplemental smoke reruns were green on head `2a86aa0`:
  - Required CI: `workflow-lint`, `quality-and-coverage` on ubuntu/macos/windows, `CodeQL preflight`, and `analyze (javascript-typescript)`
  - Supplemental smoke reruns:
    - `service-smoke.yml`: <https://github.com/openassistuk/openassist/actions/runs/23347198799>
    - `lifecycle-e2e-smoke.yml`: <https://github.com/openassistuk/openassist/actions/runs/23347198718>
- [x] (2026-03-20 14:35+00:00) Addressed the only actionable review finding on PR #44 by restoring the darwin `process.platform` spy in `tests/vitest/setup-quickstart-validation.test.ts`, then reran `pnpm exec vitest run tests/vitest/setup-quickstart-validation.test.ts`.
- [ ] Monitor CI, review, and code-scanning until PR #44 is merge-ready.

## Surprises & Discoveries

- Observation: the implementation gap is much smaller than the wording gap.
  Evidence: `apps/openassist-cli/src/lib/service-manager.ts`, `scripts/install/bootstrap.sh`, `.github/workflows/ci.yml`, `.github/workflows/service-smoke.yml`, and `.github/workflows/lifecycle-e2e-smoke.yml` already include real `darwin`/`launchd` support and `macos-latest` coverage.
- Observation: the strongest remaining drift risk is shared docs and regression coverage, not missing launchd code paths.
  Evidence: `docs/operations/quickstart-linux-macos.md` still said `Linux is the primary release target`, and `docs/operations/install-macos.md` still ended with `Linux remains the deeper validation target`.
- Observation: hosted live launchd smoke was already tried and deliberately backed out for stability reasons.
  Evidence: `docs/execplans/openassist-v1.md` records the earlier move from hosted live launchd operations to hosted macOS dry-run smoke while stabilizing GitHub-hosted workflow behavior.
- Observation: the parity pass uncovered one real launchd regression in the saved quickstart summary, even though the main service-manager implementation was already in place.
  Evidence: the new darwin assertion added to `tests/node/cli-setup-validation-coverage.test.ts` initially failed because `buildSetupSummary(...)` did not pass `serviceManagerKind="launchd"` into `buildLifecycleReport(...)`.
- Observation: the only review feedback after opening the PR was about test isolation rather than platform semantics or lifecycle correctness.
  Evidence: Copilot review comment `#discussion_r2966084593` flagged that the new darwin validation test mocked `process.platform` without restoring it.

## Decision Log

- Decision: keep hosted macOS smoke dry-run in this PR.
  Rationale: the repo already treats hosted macOS dry-run smoke as the stable contract; parity here means consistent support, coverage, and truthfulness, not reviving a previously removed flaky workflow shape.
  Date/Author: 2026-03-20 / Codex
- Decision: enforce parity through shared docs-truth and launchd-aware lifecycle tests instead of adding a macOS-only product fork.
  Rationale: the implementation already shares the main lifecycle path across Linux and macOS, so the safest change is to tighten truthfulness and regression coverage around that shared path.
  Date/Author: 2026-03-20 / Codex

## Outcomes & Retrospective

Work is in progress. The audit confirmed that this is primarily a parity-hardening and truthfulness pass, not a greenfield macOS implementation. The doc and regression pass is now in place, and it already caught one real launchd truthfulness bug in the saved quickstart summary. Focused validation and the full local verification gate are green, PR #44 is open, and both supplemental smoke workflows have been dispatched. The remaining work is the GitHub PR/CI/review loop until the branch is merge-ready.

## Context and Orientation

The installed operator lifecycle is split across a few main surfaces. `scripts/install/bootstrap.sh` is the shell bootstrap entrypoint used by both `install.sh` and local-checkout installation. `apps/openassist-cli/src/commands/setup.ts`, `apps/openassist-cli/src/commands/service.ts`, and `apps/openassist-cli/src/index.ts` implement the operator CLI. `apps/openassist-cli/src/lib/service-manager.ts` is the service-manager adapter that selects Linux `systemd` or macOS `launchd`. `apps/openassistd/src/install-context.ts` reconstructs live install/service context for runtime awareness and `/status`-style surfaces.

The shared operator docs live in `README.md`, `docs/README.md`, `docs/operations/quickstart-linux-macos.md`, `docs/operations/install-linux.md`, `docs/operations/install-macos.md`, `docs/architecture/overview.md`, and `docs/testing/`. Contributor discipline lives in `AGENTS.md`. The docs-truth gate is `tests/node/cli-docs-truth.test.ts`. Launchd/rendering/setup behavior is already covered in `tests/vitest/service-manager-macos.test.ts`, `tests/vitest/service-manager-adapter.test.ts`, `tests/vitest/lifecycle-readiness.test.ts`, `tests/node/cli-service-manager-coverage.test.ts`, and setup validation coverage.

## Plan of Work

First, patch the shared docs and contributor rules so they stop describing macOS as secondary. The shared quickstart, architecture overview, test-matrix guidance, and GitHub landing/docs index should all describe Linux and macOS as the first-class installed operator paths, while keeping Linux-only `systemd` semantics and Windows non-parity scope explicit.

Second, add regression coverage that proves macOS stays truthful in the shared lifecycle path. Extend docs-truth assertions to reject the old Linux-primary/deeper-target wording and require the new parity wording. Extend setup validation and setup summary coverage so a `darwin` run resolves to `launchd` and reports Linux systemd filesystem access as `Not applicable on launchd`. Extend bootstrap contract coverage so the macOS prerequisite/install path stays pinned in tests.

Third, run focused local tests, then the full verification gate. After that, commit, push, open the PR, rerun `service-smoke.yml` and `lifecycle-e2e-smoke.yml` on the branch, and keep monitoring `gh pr checks`, review threads, and code scanning until the branch is clean enough for human merge.

## Concrete Steps

From the repository root:

    git checkout -b feat/macos-first-class-parity

Apply the doc and test patches with `apply_patch`, then run focused validation:

    pnpm exec vitest run tests/vitest/setup-quickstart-validation.test.ts
    node --test --import tsx/esm tests/node/cli-docs-truth.test.ts
    node --test --import tsx/esm tests/node/cli-setup-validation-coverage.test.ts
    node --test --import tsx/esm tests/node/install-bootstrap-idempotence.test.ts

Then run the full local gate:

    pnpm verify:all

After local validation passes:

    git status --short
    git add README.md AGENTS.md CHANGELOG.md docs tests
    git commit -m "docs: harden macOS operator parity"
    git push -u origin feat/macos-first-class-parity
    gh pr create --base main --head feat/macos-first-class-parity --title "feat: make macOS a first-class supported operator path"
    gh workflow run service-smoke.yml --ref feat/macos-first-class-parity
    gh workflow run lifecycle-e2e-smoke.yml --ref feat/macos-first-class-parity

## Validation and Acceptance

Acceptance is met when:

1. Shared operator docs no longer describe Linux as the primary or deeper installed-lifecycle target over macOS.
2. Linux-only behavior remains explicitly Linux-only in wording and tests (`systemd`, `systemdFilesystemAccess`, root-vs-user systemd selection).
3. Launchd-aware lifecycle validation remains truthful in setup and status-style surfaces.
4. Focused validation plus `pnpm verify:all` pass locally.
5. PR checks are green for `workflow-lint`, `quality-and-coverage` on ubuntu/macos/windows, `CodeQL preflight`, and `analyze (javascript-typescript)`.
6. Manual reruns of `service-smoke.yml` and `lifecycle-e2e-smoke.yml` on the PR branch are green.
7. No actionable PR review comments or code-scanning alerts remain.

## Idempotence and Recovery

The docs and test edits are additive and safe to rerun. If focused tests fail, fix the wording or launchd-aware expectations and rerun the same commands. If `pnpm verify:all` exposes unrelated drift, record the surprise here, patch the smallest truthful fix, and rerun. If hosted smoke reruns fail, inspect workflow logs, fix the macOS or shared lifecycle defect, and rerun the same named workflows until the evidence matches the documented contract.

## Artifacts and Notes

Important discovered evidence before editing:

    docs/operations/quickstart-linux-macos.md
    - contained: "Linux is the primary release target"

    docs/operations/install-macos.md
    - contained: "Linux remains the deeper validation target"

    docs/execplans/openassist-v1.md
    - records the decision to keep hosted macOS smoke dry-run while stabilizing GitHub-hosted lifecycle automation

## Interfaces and Dependencies

This change must not add new CLI commands, config keys, or runtime type variants. The public service-manager surface remains:

    "systemd-user" | "systemd-system" | "launchd"

The relevant dependencies are the existing CLI/runtime modules, the docs-truth node test, the setup-validation tests, and the current GitHub workflows:

    .github/workflows/ci.yml
    .github/workflows/codeql.yml
    .github/workflows/service-smoke.yml
    .github/workflows/lifecycle-e2e-smoke.yml
