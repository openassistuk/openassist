# Protected-Branch Docs + Coverage Alignment Pass

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` are maintained as work proceeds.

This file follows `.agents/PLANS.md` from the repository root.

## Purpose / Big Picture

This pass keeps `main` protected while we align public/operator documentation with actual behavior and raise coverage gates without regressing CI. After completion, docs describe the current CLI/service behavior accurately, coverage thresholds are moderately stricter, and tests are expanded so the higher thresholds pass on Linux/macOS/Windows.

## Progress

- [x] (2026-03-04 13:27Z) Verified working branch `hardening/docs-coverage-alignment` and current local edit set.
- [x] (2026-03-04 13:27Z) Verified `main` ruleset is active and required check contexts are enforced.
- [x] (2026-03-04 13:27Z) Applied first docs + threshold edits across `README.md`, ops docs, test matrix, changelog, `AGENTS.md`, `vitest.config.ts`, and `package.json`.
- [x] (2026-03-04 13:29Z) Added new node integration coverage test `tests/node/cli-api-surface-coverage.test.ts` and validated targeted runs.
- [x] (2026-03-04 13:31Z) Added deterministic Vitest branch tests in `tests/vitest/service-manager-adapter.test.ts` and stabilized platform-safe `getuid` mocking.
- [x] (2026-03-04 13:35Z) Verified raised coverage gates with fresh runs:
  - Vitest: lines/statements/functions `82.06`, branches `73.72`
  - Node: lines/statements `79.39`, branches `71.33`, functions `87.57`
- [x] (2026-03-04 13:33Z) Ran `pnpm verify:all` successfully with updated thresholds and test additions.
- [x] (2026-03-04 13:33Z) Completed docs consistency checks:
  - local markdown links (repo docs, excluding `.tmp`) passed
  - CLI command surface examples aligned with command registration files
  - workflow cadence wording matches `.github/workflows/ci.yml` and `.github/workflows/service-smoke.yml`
- [x] (2026-03-04 13:34Z) Verified community profile docs URL now points to `https://github.com/openassistuk/openassist/tree/main/docs`.
- [x] (2026-03-04 13:42Z) Committed/pushed coherent change sets and opened PR `https://github.com/openassistuk/openassist/pull/1`.
- [x] (2026-03-04 13:46Z) Captured CI follow-up fix for detached-checkout upgrade dry-run branch behavior and confirmed all required PR checks green.

## Surprises & Discoveries

- Observation: A prior coverage test draft attempted direct `@openassist/config` import from Vitest tests and failed module resolution in the test runtime.
  Evidence: Targeted Vitest run failed on import resolution until the direct import/mocking path was removed.

- Observation: The first markdown-link pass reported thousands of false positives from `.tmp/openclaw-audit-*` working files.
  Evidence: Link-check output was dominated by `.tmp` paths; rerunning with `.tmp` excluded produced a clean result for tracked docs.

## Decision Log

- Decision: Use a focused test-addition approach first (targeted high-yield low-coverage CLI/runtime helper files) before touching broader test harness behavior.
  Rationale: Keeps risk low and preserves deterministic cross-platform behavior while meeting moderate threshold bump.
  Date/Author: 2026-03-04 / Codex

- Decision: Keep branch protections active throughout and use standard feature-branch PR flow.
  Rationale: User request explicitly requires protected-branch workflow, no ruleset disable/force-push for this pass.
  Date/Author: 2026-03-04 / Codex

## Outcomes & Retrospective

Docs and coverage are aligned with the requested protected-branch release pass. Operator docs now match current auth-status redaction and upgrade dirty-tree behavior, threshold docs are synchronized at the new levels, and additional deterministic tests keep the stricter gates green. The PR is open with all required checks passing under active branch protections.

## Context and Orientation

The repo has a CLI (`apps/openassist-cli`), daemon (`apps/openassistd`), and supporting packages/tests (`packages/*`, `tests/vitest`, `tests/node`). Public-release readiness depends on docs matching real behavior and CI quality gates staying green. Coverage gates are enforced via:

- `vitest.config.ts` for Vitest thresholds.
- `package.json` script `test:coverage:node` for Node integration thresholds.

Docs that must stay aligned include:

- Root `README.md` and `docs/README.md`.
- Operations docs under `docs/operations/`.
- Test matrix under `docs/testing/test-matrix.md`.
- Policy/discipline docs like `AGENTS.md`.
- Operator-facing release notes in `CHANGELOG.md`.

## Plan of Work

First stabilize the existing edits by running targeted tests for modified test files. Then run coverage commands for Vitest and Node, inspect uncovered paths, and add deterministic tests that increase covered lines/branches in low-coverage CLI/helper files. Once thresholds pass, run the full quality gate (`pnpm verify:all`) and doc consistency checks (links, command examples, workflow statements). Finally commit in coherent chunks and open a PR against `main`.

## Concrete Steps

From `<repo-root>`:

1. Run targeted tests for changed/new tests:
   - `pnpm exec vitest run tests/vitest/runtime-context.test.ts tests/vitest/setup-quickstart-validation.test.ts`
   - `pnpm exec tsx --test tests/node/cli-api-surface-coverage.test.ts`
2. Run coverage gates:
   - `pnpm test:coverage:vitest`
   - `pnpm test:coverage:node`
3. Add targeted tests until coverage thresholds pass.
4. Run final quality gate:
   - `pnpm verify:all`
5. Run doc consistency checks:
   - markdown link check for changed docs
   - command surface checks against CLI command files
   - workflow cadence check against `.github/workflows/*.yml`
6. Commit, push branch, and open PR.

## Validation and Acceptance

Acceptance for this pass is:

- Docs show redacted auth status behavior and correct upgrade dirty-tree behavior.
- `docs/testing/test-matrix.md` test inventory matches current test files.
- Vitest coverage meets or exceeds lines/statements/functions `>=81`, branches `>=71`.
- Node coverage meets or exceeds lines/statements `>=79`, functions `>=80`, branches `>=70`.
- `pnpm verify:all` passes.
- PR is open from `hardening/docs-coverage-alignment` to `main` with required checks pending/passing.

## Idempotence and Recovery

All commands are safe to re-run. If coverage remains below target, continue adding deterministic tests in low-coverage files instead of lowering thresholds. If a new test introduces platform variance, revert that test and replace it with a mock-driven deterministic case.

## Artifacts and Notes

Key verification evidence:

- `pnpm verify:all` passed end-to-end.
- `pnpm test:coverage:vitest` passed with:
  - All files: statements `82.06`, branches `73.72`, functions `93.85`, lines `82.06`.
- `pnpm test:coverage:node` passed with:
  - Statements `79.39`, branches `71.33`, functions `87.57`, lines `79.39`.
- Markdown link check (tracked docs, excluding `.tmp`) reported:
  - `Markdown link check: OK (no broken local links found in tracked docs)`.
- Community profile check:
  - `gh api repos/openassistuk/openassist/community/profile` returns `documentation` as `https://github.com/openassistuk/openassist/tree/main/docs`.
- PR and check evidence:
  - PR URL: `https://github.com/openassistuk/openassist/pull/1`
  - Required checks: `workflow-lint`, `quality-and-coverage (ubuntu-latest)`, `quality-and-coverage (macos-latest)`, `quality-and-coverage (windows-latest)`, `CodeQL preflight`, `analyze (javascript-typescript) (javascript-typescript)` all `SUCCESS`.

## Interfaces and Dependencies

No runtime/public API interfaces change in this pass. Affected interfaces are documentation surfaces and quality gates. Test additions should target existing command handlers and helpers without changing command signatures or config schema.

---

Revision Note (2026-03-04 / Codex): Created this ExecPlan to govern the protected-branch docs + coverage alignment implementation and to capture progress/evidence per `.agents/PLANS.md`.
Revision Note (2026-03-04 / Codex): Updated progress, discoveries, and outcomes after threshold gate closure, docs consistency validation, and full verification pass.
Revision Note (2026-03-04 / Codex): Finalized plan with PR/check closure evidence and CI follow-up remediation note.
