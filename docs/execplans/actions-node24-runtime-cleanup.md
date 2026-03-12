# Remove Node 20 GitHub Actions Runtime Warnings

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [.agents/PLANS.md](/c:/Users/dange/Coding/openassist/.agents/PLANS.md).

## Purpose / Big Picture

After this change, OpenAssist's GitHub workflow runs should stop emitting the GitHub-hosted warning that some JavaScript actions still depend on the deprecated Node 20 actions runtime. Contributors should be able to merge and monitor CI on `main` and pull requests without seeing those warnings on the repo's own workflows. The visible proof is a fresh `CI` and `CodeQL` run on a PR and on `main` that completes without the Node 20 deprecation annotation.

## Progress

- [x] (2026-03-12 19:12Z) Confirmed the warning source: `actions/checkout@v4`, `actions/setup-node@v4`, and `actions/upload-artifact@v4` have newer Node 24-ready majors, while `pnpm/action-setup@v4` still declares `runs.using: node20`.
- [x] (2026-03-12 19:12Z) Created branch `chore/actions-node24-runtime`.
- [x] (2026-03-12 19:13Z) Updated `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/service-smoke.yml`, and `.github/workflows/lifecycle-e2e-smoke.yml` to use `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v6` where applicable, and `corepack`-based pnpm activation.
- [x] (2026-03-12 19:16Z) Ran `pnpm lint:workflows` successfully after the workflow edits.
- [x] (2026-03-12 19:18Z) Ran `pnpm verify:all` successfully from the repository root.
- [x] (2026-03-12 19:18Z) Confirmed there are no separate tests, docs-truth assertions, or contributor docs that require updates for this workflow-only bootstrap change.
- [ ] Push branch, open PR, and watch PR checks plus review threads until the branch is fully green and ready for user merge.

## Surprises & Discoveries

- Observation: The only remaining Node 20 warning source without a newer Node 24-ready major is `pnpm/action-setup`.
  Evidence: Upstream `action.yml` for `pnpm/action-setup@v4.3.0` still contains `runs.using: node20`, while `actions/checkout@v5.0.0`, `actions/setup-node@v5.0.0`, and `actions/upload-artifact@v6.0.0` declare `runs.using: node24`.

- Observation: OpenAssist already uses `corepack prepare "pnpm@${PINNED_PNPM_VERSION}" --activate` in bootstrap/install scripts and tests.
  Evidence: `tests/node/bootstrap-interactive-contract.test.ts`, `tests/vitest/bootstrap-arg-parsing.test.ts`, and `tests/node/install-bootstrap-idempotence.test.ts` all assert the existing bootstrap path uses `corepack`.

- Observation: The workflow change does not require additional docs-truth or test-fixture updates outside the workflow files.
  Evidence: repository search and targeted explorer review found no tracked docs/tests referencing `pnpm/action-setup` or the old workflow action majors outside `.github/workflows/`.

## Decision Log

- Decision: Replace `pnpm/action-setup` in all workflow files instead of waiting for a future upstream release.
  Rationale: Keeping `pnpm/action-setup@v4` would preserve the Node 20 warning even after upgrading the official GitHub-maintained actions.
  Date/Author: 2026-03-12 / Codex

- Decision: Use `corepack enable` plus `corepack prepare pnpm@10.31.0 --activate` after `actions/setup-node`.
  Rationale: This keeps the workflows aligned with the repository's existing bootstrap strategy and avoids introducing a second package-manager installation mechanism.
  Date/Author: 2026-03-12 / Codex

## Outcomes & Retrospective

Local implementation is complete and validated. The remaining work is release discipline: push the branch, open the PR, and confirm the remote workflows stop emitting the Node 20 deprecation warning while staying green on PR and `main`.

## Context and Orientation

The workflows that trigger the warning live under `.github/workflows/`. The required PR and `main` gates are in `.github/workflows/ci.yml` and `.github/workflows/codeql.yml`. The scheduled/manual supplementary lifecycle runs are in `.github/workflows/service-smoke.yml` and `.github/workflows/lifecycle-e2e-smoke.yml`. The current warnings appear because those files still reference JavaScript actions whose action runtime is Node 20, even though the project itself is tested on Node 22.

The package manager in this repository is `pnpm`, but there are two different ways to make `pnpm` available in CI. One is `pnpm/action-setup`, which is currently the warning source. The other is `corepack`, which ships with modern Node.js and can activate a pinned `pnpm` version. OpenAssist already uses `corepack` in install/bootstrap scripts, so the workflow fix should reuse that path for consistency.

## Plan of Work

Update `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/service-smoke.yml`, and `.github/workflows/lifecycle-e2e-smoke.yml`. In each file, bump `actions/checkout` to `@v5` and `actions/setup-node` to `@v5`. In `ci.yml`, also bump `actions/upload-artifact` to `@v6`. Remove each `pnpm/action-setup` step. After `actions/setup-node`, add a shell step that enables `corepack`, activates `pnpm@10.31.0`, and prints `pnpm --version` so the workflow logs prove the package manager is available.

After the workflow edits, run the repository validation command from the repo root. If the changed workflow syntax or shell commands break any platform expectations, refine the setup step until `pnpm verify:all` succeeds locally. Then push the branch, open a PR, and wait for GitHub `CI` and `CodeQL` to rerun on the PR. If review comments or CI failures appear, address them, update this plan, and keep iterating until the PR is merge-ready.

## Concrete Steps

From `c:\Users\dange\Coding\openassist`:

    git switch -c chore/actions-node24-runtime
    pnpm verify:all
    git push -u origin chore/actions-node24-runtime
    gh pr create --fill
    gh pr checks <pr-number> --watch

Expected outcomes:

    - `pnpm verify:all` exits 0.
    - The PR shows green `workflow-lint`, green Linux/macOS/Windows `quality-and-coverage`, and green `CodeQL preflight` plus `analyze (javascript-typescript)` plus top-level `CodeQL`.
    - The workflow annotation about Node 20 JavaScript actions no longer appears on the repo's own workflow runs.

## Validation and Acceptance

Validation is complete when all of the following are true:

1. `pnpm verify:all` passes locally from the repository root.
2. A fresh PR run for this branch shows `CI` and `CodeQL` complete successfully.
3. The PR workflow run annotations no longer list deprecated Node 20 JavaScript actions for OpenAssist's own workflow files.
4. After merge, the `main` push workflows for the merge commit also finish green without the Node 20 deprecation annotation.

## Idempotence and Recovery

These workflow changes are safe to rerun because they only change CI bootstrap steps. If a `corepack` command behaves differently on one GitHub-hosted operating system, rerun the same local validation after adjusting only the workflow setup step. The branch can be refreshed by force-pushing only if needed for review iteration; otherwise use normal additive commits.

## Artifacts and Notes

Primary upstream evidence gathered before implementation:

    pnpm/action-setup@v4.3.0 action.yml -> runs.using: node20
    actions/checkout@v5.0.0 action.yml -> runs.using: node24
    actions/setup-node@v5.0.0 action.yml -> runs.using: node24
    actions/upload-artifact@v6.0.0 action.yml -> runs.using: node24

## Interfaces and Dependencies

The changed interfaces are the YAML workflow steps under `.github/workflows/`. No application runtime package interface changes are expected. The workflow bootstrap after this change must still provide:

    - Git checkout via `actions/checkout@v5`
    - Node 22 with pnpm cache via `actions/setup-node@v5`
    - pnpm 10.31.0 activated through `corepack`
    - coverage artifact uploads in `ci.yml` via `actions/upload-artifact@v6`

Revision note (2026-03-12 19:12Z): Created the initial ExecPlan after confirming the warning source and the repository's existing `corepack` usage so the workflow cleanup can be implemented and audited end to end.

Revision note (2026-03-12 19:18Z): Updated progress, discoveries, and outcomes after landing the workflow edits and passing `pnpm lint:workflows` plus `pnpm verify:all` locally.
