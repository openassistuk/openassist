# Dependabot alert remediation

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [`.agents/PLANS.md`](../../.agents/PLANS.md).

## Purpose / Big Picture

OpenAssist currently has 7 open GitHub Dependabot alerts on `main`. They are all transitive runtime vulnerabilities coming from three packages in the resolved lockfile: `undici`, `file-type`, and `music-metadata`. After this change, the branch will pin patched minimum versions for those transitive packages, prove the fixed floors locally with audits and tests, and carry a PR all the way through required CI, supplemental smoke evidence, CodeQL, and automated review until it is ready for manual merge.

This is a security maintenance change, not a dependency modernization pass. The user-visible result is that the repo's dependency graph is back on patched versions without broad package churn or public CLI/config changes.

## Progress

- [x] (2026-03-20 19:01Z) Created branch `fix/dependabot-alert-remediation` from `main`.
- [x] (2026-03-20 19:01Z) Confirmed `gh` auth, branch protection, and current open Dependabot alerts from GitHub.
- [x] (2026-03-20 19:01Z) Audited the local dependency graph and confirmed that the 7 alerts collapse to 3 transitive packages: `undici`, `file-type`, and `music-metadata`.
- [x] (2026-03-20 19:01Z) Patched root overrides, added the dependency-security contract test, updated the test inventory doc, and added the changelog note.
- [x] (2026-03-20 19:03Z) Refreshed `pnpm-lock.yaml`; the resolved graph now uses `undici@6.24.0`, `file-type@21.3.2`, and `music-metadata@11.12.3`, with the old vulnerable exact versions removed.
- [x] (2026-03-20 19:03Z) Ran focused local validation:
  - `node --test --import tsx/esm tests/node/dependency-security-overrides.test.ts`
  - `pnpm audit --prod --json`
  - `pnpm audit --json`
- [x] (2026-03-20 19:05Z) Ran `pnpm verify:all`; workflow lint, build, lint, typecheck, Vitest, Node tests, and both coverage suites all passed after the dependency remediation.
- [x] (2026-03-20 19:08Z) Committed the remediation as `bc97b77` (`fix: remediate open Dependabot alerts`), pushed `fix/dependabot-alert-remediation`, and opened PR [#46](https://github.com/openassistuk/openassist/pull/46).
- [x] (2026-03-20 19:09Z) Manually dispatched the supplemental smoke workflows on the PR branch:
  - `service-smoke.yml`: <https://github.com/openassistuk/openassist/actions/runs/23358489160>
  - `lifecycle-e2e-smoke.yml`: <https://github.com/openassistuk/openassist/actions/runs/23358489525>
- [ ] Monitor required checks, rerun supplemental smoke workflows, address review/code-scanning feedback, and hand the PR back only when merge-ready.

## Surprises & Discoveries

- Observation: the repo already uses `pnpm.overrides` for transitive security fixes, so this remediation can stay narrow.
  Evidence: root `package.json` already pinned patched floors for `minimatch`, `undici`, `esbuild`, and `file-type`.
- Observation: the 7 GitHub alerts are not 7 independent fixes.
  Evidence: GitHub Dependabot alerts show `undici` alerts `#3` to `#7`, `file-type` alert `#2`, and `music-metadata` alert `#8`, all from `pnpm-lock.yaml`.
- Observation: adding a new Node test requires a docs update in this repo.
  Evidence: `tests/node/cli-docs-truth.test.ts` validates the exact on-disk `tests/node/*.test.ts` inventory against `docs/testing/test-matrix.md`.
- Observation: no direct dependency bump was required to clear the current alert set.
  Evidence: updating only root `pnpm.overrides` and regenerating `pnpm-lock.yaml` produced a clean graph and both audit commands returned zero advisories.

## Decision Log

- Decision: keep this PR to override and lockfile remediation unless resolution forces a direct stable package bump.
  Rationale: the user asked for a narrow Dependabot-fix branch, and the affected vulnerabilities are all transitive.
  Date/Author: 2026-03-20 / Codex
- Decision: add one explicit dependency-security contract test instead of relying only on ad hoc audit output.
  Rationale: the repo already treats docs/workflow/test truth as merge-gated contracts; the security floor should have the same regression protection.
  Date/Author: 2026-03-20 / Codex

## Outcomes & Retrospective

Work is in progress. The remediation is complete locally and PR #46 is open with the first pair of supplemental smoke reruns dispatched. The lockfile uses only patched versions for the three affected transitive packages, both `pnpm audit` commands are clean, and `pnpm verify:all` passed without needing any direct dependency bump. The remaining work is the remote PR/check/review loop until the branch is merge-ready.

## Context and Orientation

The root dependency policy lives in `package.json`, with resolved versions captured in `pnpm-lock.yaml`. Open GitHub Dependabot alerts are generated from the default branch and track vulnerable packages in that lockfile, not just direct dependencies. In this repository, that means a branch can be fully fixed and auditable before the alerts disappear from `main`; the alerts will close only after the fix merges.

The current affected top-level package paths are:

- `packages/channels-discord/package.json` -> `discord.js` -> `undici`
- `packages/channels-whatsapp-md/package.json` -> `@whiskeysockets/baileys` -> `music-metadata` -> `file-type`

The required local and CI truth surfaces are strict. `tests/node/cli-docs-truth.test.ts` enforces the test inventory in `docs/testing/test-matrix.md`. The release note for this security change must go into `CHANGELOG.md`. Branch protection for `main` currently requires `workflow-lint`, the three `quality-and-coverage` matrix jobs, `CodeQL preflight`, `analyze (javascript-typescript) (javascript-typescript)`, and `launchd-live-smoke (macos-latest)`.

## Plan of Work

First, update the root override floors so the patched minimums are explicit in `package.json`: `undici` at `6.24.0`, `file-type` at `21.3.2`, and `music-metadata` at `11.12.3`. Then regenerate `pnpm-lock.yaml` so the resolved graph no longer includes `undici@6.23.0`, `file-type@21.3.1`, or `music-metadata@11.12.1`.

Second, add one Node test that reads `package.json` and `pnpm-lock.yaml` and asserts both the override keys and the resolved package entries for the patched versions, while rejecting the old vulnerable exact versions. Update `docs/testing/test-matrix.md` to include that new test file, and add a concrete security note to `CHANGELOG.md`.

Third, run focused validation, then the full local gate. After local proof is clean, commit, push, open the PR, dispatch the supplemental smoke workflows, and keep monitoring `gh pr checks`, review threads, Copilot review state, and code scanning until the branch is fully green and review-clean.

## Concrete Steps

From the repository root:

    pnpm install --frozen-lockfile=false
    node --test --import tsx/esm tests/node/dependency-security-overrides.test.ts
    pnpm audit --prod --json
    pnpm audit --json
    pnpm verify:all

After local validation passes:

    git status --short
    git add package.json pnpm-lock.yaml tests/node/dependency-security-overrides.test.ts docs/testing/test-matrix.md CHANGELOG.md docs/execplans/dependabot-alert-remediation.md
    git commit -m "fix: remediate open Dependabot alerts"
    git push -u origin fix/dependabot-alert-remediation
    gh pr create --base main --head fix/dependabot-alert-remediation --title "fix: remediate open Dependabot alerts"
    gh workflow run service-smoke.yml --ref fix/dependabot-alert-remediation
    gh workflow run lifecycle-e2e-smoke.yml --ref fix/dependabot-alert-remediation

## Validation and Acceptance

Acceptance is met when:

1. Local audits show no remaining advisories.
2. `package.json` and `pnpm-lock.yaml` both pin patched floors for `undici`, `file-type`, and `music-metadata`.
3. `pnpm verify:all` passes.
4. The PR is green on all required checks for `main`.
5. Manual reruns of `service-smoke.yml` and `lifecycle-e2e-smoke.yml` on the PR branch are green and recorded here.
6. Copilot/code review is current on the final PR head, all actionable comments are addressed, and all review threads are resolved.
7. No actionable PR-head code-scanning findings remain.

## Idempotence and Recovery

This remediation is safe to rerun. If `pnpm install` resolves a different patched version than expected, update the contract test and changelog only if the new version still satisfies the exact GitHub advisory minimums and does not broaden the change unnecessarily. If audits still show findings after the override refresh, inspect the remaining vulnerable path before changing any direct dependency. If CI or supplemental smoke fails, fix only the regression introduced by this branch and rerun the same checks.

## Artifacts and Notes

Important pre-change evidence:

    GitHub Dependabot alerts:
    - #2 file-type -> fixed in 21.3.2+
    - #3-#7 undici -> fixed in 6.24.0+
    - #8 music-metadata -> fixed in 11.12.3+

    Local lockfile before remediation:
    - undici@6.23.0
    - file-type@21.3.1
    - music-metadata@11.12.1

    Local proof after remediation:
    - pnpm audit --prod --json -> 0 advisories
    - pnpm audit --json -> 0 advisories
    - pnpm verify:all -> passed

## Interfaces and Dependencies

No public interfaces change. No CLI commands, config keys, workflow triggers, or runtime types are added.

The dependency floors that must exist at the end of this work are:

    undici@<6.24.0 -> 6.24.0
    file-type@<21.3.2 -> 21.3.2
    music-metadata@<11.12.3 -> 11.12.3
