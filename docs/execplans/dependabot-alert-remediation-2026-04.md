# Dependabot alert remediation (2026-04)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [`.agents/PLANS.md`](../../.agents/PLANS.md).

## Purpose / Big Picture

OpenAssist currently has 3 open GitHub Dependabot alerts on `main`. They collapse to 2 transitive package floors in `pnpm-lock.yaml`: `lodash` and `picomatch`. After this change, the branch will pin patched minimum versions for those transitive packages, refresh the lockfile, prove the fixed floors locally, and carry a PR through required CI, supplemental smoke evidence, CodeQL, and automated review until it is ready for manual merge.

This is a narrow security maintenance change. It should not broaden into a direct dependency modernization pass unless the override-only path fails.

## Progress

- [x] (2026-04-02 17:01Z) Created branch `fix/dependabot-alert-remediation-2026-04` from `main`.
- [x] (2026-04-02 17:01Z) Confirmed current open Dependabot alerts from GitHub and verified that the 3 alerts collapse to `lodash` alerts `#12` and `#13`, plus `picomatch` alert `#11`.
- [x] (2026-04-02 17:01Z) Confirmed the transitive dependency paths:
  - `discord.js -> @sapphire/shapeshift -> lodash`
  - `@tktco/node-actionlint -> fast-glob -> micromatch -> picomatch`
- [x] (2026-04-02 17:01Z) Patched root overrides, extended the dependency-security contract test, updated `CHANGELOG.md`, and refreshed `pnpm-lock.yaml` for `lodash` and `picomatch`.
- [x] (2026-04-02 17:18Z) Added the narrow `brace-expansion@5.0.5` override discovered by full `pnpm audit --json`, then refreshed the lockfile and cleared the remaining audited dev-only advisory path.
- [x] (2026-04-02 17:22Z) Ran focused validation:
  - `node --test --import tsx/esm tests/node/dependency-security-overrides.test.ts`
  - `pnpm audit --prod --json`
  - `pnpm audit --json`
- [x] (2026-04-02 17:31Z) Ran `pnpm verify:all` successfully on branch `fix/dependabot-alert-remediation-2026-04`.
- [ ] Commit, push, open the PR, dispatch `service-smoke.yml` and `lifecycle-e2e-smoke.yml`, and monitor the branch until all required checks and review surfaces are green.

## Surprises & Discoveries

- Observation: the repo already uses root `pnpm.overrides` as the preferred narrow fix path for transitive security remediation.
  Evidence: `package.json` already pins floors for `minimatch`, `undici`, `esbuild`, `file-type`, and `music-metadata`.
- Observation: the new `lodash` alerts are both cleared by the same patched floor.
  Evidence: GitHub alerts `#12` and `#13` both target `lodash` in `pnpm-lock.yaml`, and both advisory records patch at `4.18.0`.
- Observation: the new `picomatch` alert also has a clean override path without requiring a parent-package bump.
  Evidence: `micromatch@4.0.8` depends on `picomatch ^2.3.1`, so `2.3.2` fits the existing semver range.
- Observation: the current parent packages do not offer a cleaner upstream release path than targeted overrides.
  Evidence: `@sapphire/shapeshift@4.0.0` still declares `lodash ^4.17.21`, and `@tktco/node-actionlint@1.6.0` still pulls `fast-glob@^3.3.3 -> micromatch@^4.0.8 -> picomatch@^2.3.1`.
- Observation: the explicit `pnpm audit --json` gate is stricter than the currently open Dependabot alert set.
  Evidence: after the `lodash` and `picomatch` fixes, `pnpm audit --prod --json` was clean but `pnpm audit --json` still reported `brace-expansion@5.0.3` through `@vitest/coverage-v8 -> test-exclude -> glob/minimatch`.

## Decision Log

- Decision: keep this remediation override-only unless that path fails to clear the alerts.
  Rationale: the user explicitly asked for a minimal security patch rather than a broader dependency refresh.
  Date/Author: 2026-04-02 / Codex
- Decision: extend the existing dependency-security contract test instead of adding a second security-floor test file.
  Rationale: the current repo already has a single focused contract for override floors, and reusing it avoids unnecessary docs/test inventory churn.
  Date/Author: 2026-04-02 / Codex
- Decision: treat the PR as incomplete until required checks, supplemental smoke runs, code scanning, and automated review comments are all clean on the final PR head.
  Rationale: this matches the repo's prior security-remediation discipline and the user's explicit handoff requirement.
  Date/Author: 2026-04-02 / Codex
- Decision: include the dev-only `brace-expansion@5.0.5` override in this branch even though it is not one of the 3 currently open GitHub alerts.
  Rationale: the agreed validation commands include `pnpm audit --json`, so the narrowest decision-complete implementation is to clear that remaining audited advisory in the same remediation PR.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective

Local remediation is complete and validated. The branch now pins the narrow patched floors required for the open GitHub alerts and the stricter full-audit path, the contract test covers those exact floors, and the full local verification gate passed. The remaining work is GitHub-facing: publish the branch, open the PR, dispatch the supplemental smoke workflows, and keep iterating on CI, code scanning, and review comments until the final PR head is fully green and review-clean.

## Context and Orientation

The root dependency policy lives in `package.json`, with resolved versions captured in `pnpm-lock.yaml`. Open GitHub Dependabot alerts are generated from the default branch and track vulnerable packages in that lockfile, not just direct dependencies. In this repository, that means the alerts will stay open on GitHub until the final fix merges to `main`, even if the branch is already locally clean.

The required local and CI truth surfaces are strict. `tests/node/dependency-security-overrides.test.ts` enforces the override and lockfile contract. `CHANGELOG.md` must record the operator-facing security maintenance change. The PR is not done until the required PR checks, supplemental smoke runs, CodeQL, and automated review comments are all satisfied on the final head commit.

## Plan of Work

First, update the root override floors in `package.json` so the patched minimums are explicit for `lodash` and `picomatch`. Then refresh `pnpm-lock.yaml` so the resolved graph no longer contains `lodash@4.17.23` or `picomatch@2.3.1`.

Second, extend the dependency-security contract test to assert the two new override keys, the new patched lockfile entries, and the absence of the old vulnerable exact versions. Add a concrete `CHANGELOG.md` note for the new transitive security floors.

Third, run the focused security validation commands, then the full local verification gate. After local proof is clean, commit, push, open the PR, manually dispatch the supplemental smoke workflows, and keep monitoring required checks, review threads, and code scanning until the branch is fully green.

## Concrete Steps

From the repository root:

    pnpm install --frozen-lockfile=false
    node --test --import tsx/esm tests/node/dependency-security-overrides.test.ts
    pnpm audit --prod --json
    pnpm audit --json
    pnpm verify:all

After local validation passes:

    git status --short
    git add package.json pnpm-lock.yaml tests/node/dependency-security-overrides.test.ts CHANGELOG.md docs/execplans/dependabot-alert-remediation-2026-04.md
    git commit -m "fix: remediate open Dependabot alerts"
    git push -u origin fix/dependabot-alert-remediation-2026-04
    gh pr create --base main --head fix/dependabot-alert-remediation-2026-04 --title "fix: remediate open Dependabot alerts (lodash, picomatch)"
    gh workflow run service-smoke.yml --ref fix/dependabot-alert-remediation-2026-04
    gh workflow run lifecycle-e2e-smoke.yml --ref fix/dependabot-alert-remediation-2026-04

## Validation and Acceptance

Acceptance is met when:

1. `package.json` and `pnpm-lock.yaml` both pin patched floors for `lodash` and `picomatch`.
2. Local audits show no remaining advisories.
3. `pnpm verify:all` passes on the final branch head.
4. The PR is green on all required checks.
5. Manual reruns of `service-smoke.yml` and `lifecycle-e2e-smoke.yml` on the PR branch are green and recorded here.
6. Copilot/code review is current on the final PR head, all actionable comments are addressed, and all actionable review threads are resolved.
7. No actionable PR-head code-scanning findings remain.

## Idempotence and Recovery

This remediation is safe to rerun. If `pnpm install` resolves a different patched version than expected, update the contract test only if the new version still satisfies the exact advisory minimums and does not broaden the change unnecessarily. If audits still show findings after the override refresh, inspect the remaining vulnerable path before changing any direct dependency. If CI or smoke workflows fail, fix only the regression introduced by this branch and rerun the same checks.

## Artifacts and Notes

Important pre-change evidence:

    GitHub Dependabot alerts:
    - #11 picomatch -> fixed in 2.3.2+
    - #12 lodash -> fixed in 4.18.0+
    - #13 lodash -> fixed in 4.18.0+

    Local lockfile before remediation:
    - lodash@4.17.23
    - picomatch@2.3.1
    - brace-expansion@5.0.3 (dev-only audit path)

Local proof after remediation:

    Focused validation:
    - node --test --import tsx/esm tests/node/dependency-security-overrides.test.ts -> pass
    - pnpm audit --prod --json -> 0 advisories
    - pnpm audit --json -> 0 advisories

    Full local gate:
    - pnpm verify:all -> pass

## Interfaces and Dependencies

No public interfaces change. No CLI commands, config keys, workflow triggers, or runtime types are added.

The dependency floors that must exist at the end of this work are:

    lodash@<4.18.0 -> 4.18.0
    picomatch@<2.3.2 -> 2.3.2
    brace-expansion@>=5.0.0 <5.0.5 -> 5.0.5
