# macOS live launchd required-gate follow-up

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [`.agents/PLANS.md`](../../.agents/PLANS.md).

## Purpose / Big Picture

OpenAssist already treats macOS as a first-class operator path in docs and shared lifecycle logic, but the hosted proof is still weaker than Linux: the current macOS smoke coverage is dry-run only, and `launchd` operations inside the CLI still mix legacy `load` or `unload` behavior with newer `bootout` and `kickstart` commands. After this change, macOS should have a real hosted `launchd` lifecycle proof on `macos-latest`, the CLI should use one coherent `launchctl` model, and the new live macOS job should be strong enough to promote into the required `main` PR gate.

The user-visible outcome is stricter than the previous parity PR. This branch is not just wording or regression hardening: it either proves a stable live user-level LaunchAgent path on GitHub-hosted macOS runners and promotes that proof into branch protection, or it stops instead of pretending that supplemental smoke is sufficient.

## Progress

- [x] (2026-03-20 16:03+00:00) Created branch `feat/macos-live-launchd-required-gate`.
- [x] (2026-03-20 16:10+00:00) Audited the current launchd adapter, workflow topology, docs-truth surfaces, and install-context coverage to isolate the real remaining gaps.
- [x] (2026-03-20 16:13+00:00) Reworked `apps/openassist-cli/src/lib/service-manager.ts` so the macOS adapter now uses user-domain `launchctl print/bootstrap/enable/kickstart/bootout/disable` semantics consistently instead of legacy `load` or `unload`.
- [x] (2026-03-20 16:13+00:00) Tightened launchd artifact permissions in the install path by keeping the wrapper directory, wrapper script, log directory, and plist file owner-only where appropriate.
- [x] (2026-03-20 16:14+00:00) Added launchd-specific regression coverage for command sequencing, restart recovery after a failed `bootout`, and `launchd` install-context truthfulness.
- [x] (2026-03-20 16:14+00:00) Ran focused local validation for the launchd code path:
  - `pnpm exec vitest run tests/vitest/service-manager-adapter.test.ts tests/vitest/install-context.test.ts tests/vitest/service-manager-macos.test.ts`
  - `node --test --import tsx/esm tests/node/cli-service-manager-coverage.test.ts`
- [x] (2026-03-20 16:20+00:00) Added `.github/workflows/macos-live-launchd.yml` with a dedicated `launchd-live-smoke (macos-latest)` job that exercises live service install, status, stop/start recovery, restart, health, logs, and uninstall on GitHub-hosted macOS.
- [x] (2026-03-20 16:21+00:00) Synchronized workflow truth across `README.md`, `AGENTS.md`, `docs/README.md`, `docs/testing/test-matrix.md`, `docs/testing/chaos-and-soak.md`, `CHANGELOG.md`, and `tests/node/cli-docs-truth.test.ts`.
- [x] (2026-03-20 16:23+00:00) Extended focused validation with launchd-truth suites:
  - `pnpm exec vitest run tests/vitest/lifecycle-readiness.test.ts`
  - `pnpm exec vitest run tests/vitest/setup-quickstart-validation.test.ts`
  - `node --test --import tsx/esm tests/node/cli-docs-truth.test.ts`
- [x] (2026-03-20 16:25+00:00) Ran the full local gate with `pnpm verify:all`; workflow lint, build, lint, typecheck, Vitest, Node tests, and both coverage suites all passed.
- [x] (2026-03-20 16:28+00:00) Committed `edb3074` (`feat: require live macOS launchd smoke`), pushed `feat/macos-live-launchd-required-gate`, opened PR [#45](https://github.com/openassistuk/openassist/pull/45), and dispatched the supplemental smoke workflows:
  - `service-smoke.yml`: <https://github.com/openassistuk/openassist/actions/runs/23352211454>
  - `lifecycle-e2e-smoke.yml`: <https://github.com/openassistuk/openassist/actions/runs/23352211933>
- [x] (2026-03-20 16:30+00:00) Entered the hosted CI loop and diagnosed the first failing `launchd-live-smoke (macos-latest)` run as a workflow invocation bug rather than a launchd-domain failure.
- [x] (2026-03-20 16:35+00:00) Pushed `50f8b29` (`fix: stop node from consuming launchd env flag`) after confirming the first hosted failure was Node 22 stealing the CLI `--env-file` flag inside the workflow wrapper.
- [x] (2026-03-20 16:46+00:00) Diagnosed the second hosted `launchd-live-smoke (macos-latest)` failure as a real launchd restart race, then hardened the adapter so `bootout` waits for `launchctl print` to stop seeing the job before restart or disable continues.
- [x] (2026-03-20 16:45+00:00) Added a regression test that simulates one stale `launchctl print` success after `bootout`, and reran the focused macOS launchd and docs-truth suites successfully.
- [x] (2026-03-20 16:49+00:00) Re-ran the full local gate with `pnpm verify:all` after the restart-race fix; workflow lint, build, lint, typecheck, Vitest, Node tests, and both coverage suites all passed again.
- [x] (2026-03-20 16:58+00:00) Addressed the follow-up Copilot review on the same launchd adapter by making `restart()` rethrow real `stop()` failures and by waiting for post-`bootstrap` visibility before `enable` or `kickstart` proceeds; targeted launchd suites passed again.
- [x] (2026-03-20 17:00+00:00) Re-ran the full local gate with `pnpm verify:all` after the Copilot follow-up hardening; workflow lint, build, lint, typecheck, Vitest, Node tests, and both coverage suites all passed again.
- [x] (2026-03-20 17:12+00:00) Addressed the remaining launchd `enable()` / `disable()` review concerns by keeping startup-state commands side-effect free for unloaded jobs and by extending the hosted macOS workflow to prove disable-keeps-unloaded and enable-does-not-auto-load behavior before `start()`.
- [x] (2026-03-20 17:15+00:00) Re-ran the full local gate with `pnpm verify:all` after the launchd `enable()` / `disable()` pass; workflow lint, build, lint, typecheck, Vitest, Node tests, and both coverage suites all passed again.
- [ ] Push the final launchd follow-up fix, then continue the CI or review or code-scanning monitoring loop.
- [ ] Promote the live macOS check into required branch protection on `main` once it is stable on the PR head and a rerun is also green.

## Surprises & Discoveries

- Observation: the remaining macOS gap is now concentrated in the service-manager command model and hosted proof, not in basic darwin detection.
  Evidence: `apps/openassist-cli/src/lib/service-manager.ts` already routed macOS to `launchd`, but it still installed and enabled services with `launchctl load` and `unload` while `stop()` already used `bootout`.
- Observation: the previous parity PR left the biggest hosted-risk item intentionally unresolved.
  Evidence: `docs/execplans/openassist-v1.md` and the currently active workflow set show that hosted macOS coverage stopped at dry-run or bootstrap smoke rather than live LaunchAgent control.
- Observation: direct filesystem permission assertions for macOS artifacts are not portable when the test suite runs on Windows hosts.
  Evidence: launchd lifecycle tests run under mocked `darwin` paths in cross-platform CI, so the stable contract is the requested `chmodSync` arguments rather than host-specific `stat()` mode bits.
- Observation: the new required macOS gate can stay narrow and still meaningfully prove the previously missing launchd behavior.
  Evidence: one hosted `macos-latest` job can validate install, `launchctl print` status, real `bootout` stop, start-after-bootout recovery, restart, health, logs, and uninstall without changing the existing supplemental smoke workflows or the normal `pnpm ci:strict` topology.
- Observation: Node 22 will treat `--env-file` as a runtime flag unless the workflow stops Node option parsing explicitly before the CLI script path.
  Evidence: the first PR run of `launchd-live-smoke (macos-latest)` failed before service health with `node: /Users/runner/work/_temp/openassist-live-home/.config/openassist/openassistd.env: not found`, and the workflow invoked the CLI as `node dist/index.js ... --env-file ...` instead of `node -- dist/index.js ...`.
- Observation: `launchctl bootout` on hosted macOS can return before `launchctl print gui/<uid>/<label>` stops reporting the job, which makes an immediate restart race its own bootstrap predicate.
  Evidence: the second PR run of `launchd-live-smoke (macos-latest)` reached install, health, stop, and start successfully, then failed restart with `Could not find service "ai.openassist.openassistd" in domain for user gui: 501` from `launchctl kickstart -k ...`; a new regression test reproduces that stale-post-bootout `print` success in-process.
- Observation: the same adapter benefits from symmetrical settle checks after both `bootout` and `bootstrap`, and `restart()` should not hide unload failures once those waits exist.
  Evidence: the second Copilot review on commit `44b2b79` pointed out that `waitForBootstrappedState(true)` was otherwise unused and that `.catch(() => undefined)` in `restart()` would now suppress meaningful unload-settle failures.
- Observation: the startup-only semantics of `openassist service enable` and `openassist service disable` were still too eager on macOS until the final pass.
  Evidence: the remaining unresolved Copilot comments highlighted that `enable()` and `disable()` were bootstrapping unloaded LaunchAgents, which could start a `RunAtLoad` job as a side effect; the final branch revision removes that bootstrap and adds hosted workflow assertions that the job stays unloaded after `enable()` until `start()` is called explicitly.

## Decision Log

- Decision: fix the launchd adapter before adding the live macOS workflow.
  Rationale: a required hosted job is only worth promoting if the local command contract is coherent first; otherwise the new workflow would encode flaky or misleading lifecycle behavior.
  Date/Author: 2026-03-20 / Codex
- Decision: keep `service-smoke.yml` and `lifecycle-e2e-smoke.yml` supplemental even after the new live macOS job lands.
  Rationale: the follow-up goal is a dedicated stable live LaunchAgent proof, not a silent trigger-model change for the existing dry-run and bootstrap smoke workflows.
  Date/Author: 2026-03-20 / Codex
- Decision: treat `launchctl bootout` as a state transition that must settle before restart or disable continues.
  Rationale: real hosted macOS runners showed that a direct `bootout` followed by an immediate bootstrap check can observe a stale loaded state and skip the required re-bootstrap, so the adapter now polls `launchctl print` until the unload is visible before moving on.
  Date/Author: 2026-03-20 / Codex
- Decision: keep the launchd settle contract symmetrical by waiting after `bootstrap()` too, and let `restart()` surface real unload failures.
  Rationale: once hosted CI showed that launchd visibility can lag command completion, the truthful contract is to wait for both unload and load state transitions; after that, swallowing all `stop()` failures in `restart()` would only hide real service-manager defects.
  Date/Author: 2026-03-20 / Codex
- Decision: make macOS `enable()` and `disable()` match their startup-state intent without implicitly loading an unloaded LaunchAgent.
  Rationale: the command descriptions say these are startup-state operations, and the live hosted proof is strong enough to validate explicit `disable` -> unloaded, `enable` -> still unloaded, and `start` -> load plus health as separate steps.
  Date/Author: 2026-03-20 / Codex

## Outcomes & Retrospective

Work is in progress. The launchd command model is hardened, the dedicated live macOS workflow exists, workflow truth is synchronized across docs and tests, and the `main` ruleset now requires `launchd-live-smoke (macos-latest)`. The hosted loop has already proven the required checks and supplemental smoke workflows green on earlier heads, and the final local revision now closes the last review gap by making `enable()` / `disable()` startup-state operations for unloaded jobs while extending the hosted macOS workflow to validate that behavior explicitly. The remaining work is to re-run the full local gate, push this final follow-up, rerun the required and supplemental workflows on the final head, and then resolve the remaining review threads against that final evidence.

## Context and Orientation

The core implementation lives in `apps/openassist-cli/src/lib/service-manager.ts`, which owns the `systemd` and `launchd` adapters behind `openassist service ...`. Runtime install-awareness lives in `apps/openassistd/src/install-context.ts`. The CLI entrypoints that expose operator-facing lifecycle commands are in `apps/openassist-cli/src/commands/service.ts`, `apps/openassist-cli/src/commands/setup.ts`, and `apps/openassist-cli/src/commands/upgrade.ts`.

The current workflow surfaces are `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/service-smoke.yml`, and `.github/workflows/lifecycle-e2e-smoke.yml`. Workflow truth is checked in `tests/node/cli-docs-truth.test.ts`, and operator-facing workflow documentation currently lives in `README.md`, `AGENTS.md`, `docs/README.md`, `docs/testing/test-matrix.md`, and `docs/testing/chaos-and-soak.md`.

## Plan of Work

First, keep the launchd adapter consistent end to end. Installation and restart must no longer depend on deprecated `load` or `unload` semantics. Starting after a real `bootout` must re-bootstrap truthfully, and disable or uninstall paths must leave the user domain clean without relying on partial legacy behavior.

Second, add a dedicated live macOS workflow that runs on pull requests and exercises a real user LaunchAgent on `macos-latest`. That workflow must prove install, health, status, restart, logs, and uninstall on the same runner, and it must produce one stable required-check context rather than a matrix of incidental names.

Third, synchronize the new required-check truth across docs, contributor rules, and docs-truth assertions. The existing supplemental smoke workflows should remain documented as supplemental, while the new live macOS workflow must be documented as a normal PR gate and later reflected in the effective required checks on `main`.

Fourth, run focused validation plus `pnpm verify:all`, then open the PR and stay in the loop until the live macOS check, existing required checks, supplemental smoke reruns, review threads, and code scanning are all clean.

## Concrete Steps

From the repository root:

    git checkout -b feat/macos-live-launchd-required-gate

Apply the launchd, workflow, docs, and test patches with `apply_patch`, then run focused validation:

    pnpm exec vitest run tests/vitest/service-manager-adapter.test.ts tests/vitest/install-context.test.ts tests/vitest/service-manager-macos.test.ts
    node --test --import tsx/esm tests/node/cli-service-manager-coverage.test.ts
    node --test --import tsx/esm tests/node/cli-docs-truth.test.ts

Then run the full local gate:

    pnpm verify:all

After local validation passes:

    git status --short
    git add apps docs tests .github/workflows README.md AGENTS.md CHANGELOG.md
    git commit -m "feat: require live macOS launchd smoke"
    git push -u origin feat/macos-live-launchd-required-gate
    gh pr create --base main --head feat/macos-live-launchd-required-gate --title "feat: require live macOS launchd smoke"

After the PR is open:

    gh workflow run service-smoke.yml --ref feat/macos-live-launchd-required-gate
    gh workflow run lifecycle-e2e-smoke.yml --ref feat/macos-live-launchd-required-gate
    gh pr checks --watch

## Validation and Acceptance

Acceptance is met when:

1. The launchd adapter uses one coherent `launchctl` model for install, start, stop, restart, enable, disable, and uninstall.
2. Launchd-specific regression coverage proves exact command sequencing, restart recovery, permissions intent, and `launchd` install-context truthfulness.
3. A dedicated PR-triggered hosted macOS workflow proves live LaunchAgent install, health, status, restart, logs, and uninstall on `macos-latest`.
4. `README.md`, `AGENTS.md`, `docs/README.md`, `docs/testing/test-matrix.md`, `docs/testing/chaos-and-soak.md`, `CHANGELOG.md`, and docs-truth assertions all describe the required-check topology truthfully.
5. `pnpm verify:all` passes locally.
6. Existing required checks stay green, the new live macOS check is green on the PR head, and a rerun of that same live macOS check is also green.
7. Ruleset `13499978` shows the new live macOS check as required for `main`.
8. Manual reruns of `service-smoke.yml` and `lifecycle-e2e-smoke.yml` are green on the PR branch.
9. No actionable PR review comments or PR-head code-scanning alerts remain.

## Idempotence and Recovery

The service-manager and test changes are safe to rerun. If the live macOS workflow fails, inspect whether the failure is a true launchd behavior bug, a runner-environment assumption, or a timing issue, then patch the smallest truthful fix and rerun the same workflow. If the live macOS proof cannot be made stable enough to promote into required branch protection, stop the branch and record that evidence here instead of silently downgrading the workflow back to supplemental status.

## Artifacts and Notes

Important evidence captured before the workflow or docs patch:

    apps/openassist-cli/src/lib/service-manager.ts
    - mixed legacy launchctl load/unload with newer bootout and kickstart semantics

    .github/workflows/service-smoke.yml
    - currently supplemental manual or scheduled dry-run lifecycle smoke on ubuntu-latest and macos-latest

    .github/workflows/lifecycle-e2e-smoke.yml
    - currently supplemental manual or scheduled bootstrap and home-state smoke on ubuntu-latest and macos-latest

    repos/openassistuk/openassist/rules/branches/main
    - effective required checks currently come from ruleset 13499978 and do not yet include a dedicated live macOS launchd context

## Interfaces and Dependencies

This change must not add new CLI commands, config keys, or runtime type variants. The public service-manager surface remains:

    "systemd-user" | "systemd-system" | "launchd"

The live workflow and ruleset changes depend on the current GitHub Actions topology and the existing protected `main` ruleset `13499978`. The main local code and truth surfaces touched by this plan are:

    apps/openassist-cli/src/lib/service-manager.ts
    apps/openassistd/src/install-context.ts
    tests/vitest/service-manager-adapter.test.ts
    tests/node/cli-service-manager-coverage.test.ts
    tests/node/cli-docs-truth.test.ts
    .github/workflows/macos-live-launchd.yml
