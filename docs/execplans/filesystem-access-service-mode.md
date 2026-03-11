# Filesystem Access and Systemd Service Mode

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, OpenAssist operators can distinguish two separate questions that were previously conflated in the product story: who may ask OpenAssist for privileged work, and what the Linux daemon service may actually write on the host when it runs under systemd. `Full access for approved operators` will continue to mean that approved senders can reach OpenAssist's `full-root` tool profile, but Linux installs will also have an explicit service-level filesystem mode with a safe default. The visible proof is that quickstart, wizard, `/status`, `/access`, `/capabilities`, `openassist tools status`, lifecycle summaries, and `openassist doctor` all report the same truthful service boundary, and Linux operators can explicitly choose between the hardened systemd sandbox and an unrestricted systemd service when they really need package-manager or broader host writes.

## Progress

- [x] (2026-03-10 23:05+00:00) Audited the current access model, service template, runtime awareness surfaces, lifecycle reporting, and setup flows to confirm the gap: `full-root` policy access and Linux systemd filesystem behavior were modeled separately in practice but not exposed separately in operator setup or status output.
- [x] (2026-03-10 23:28+00:00) Added the new config/type surface for `[service].systemdFilesystemAccess`, defaulting to `"hardened"` and wiring it through config loading, runtime config normalization, migration import, and sample config.
- [x] (2026-03-10 23:54+00:00) Refactored Linux systemd unit rendering so `hardened` preserves the existing sandbox while `unrestricted` omits the OpenAssist-added filesystem hardening directives and exports the effective service mode into the daemon environment.
- [x] (2026-03-11 00:00+00:00) Updated quickstart, wizard, and setup post-save handling so Linux operators can choose the service filesystem mode, get a second confirmation before opting into unrestricted mode, and have existing systemd units rewritten before restart.
- [x] (2026-03-11 00:02+00:00) Extended daemon install-context capture, runtime awareness, `/status`, `/access`, `/capabilities`, `GET /v1/tools/status`, and lifecycle readiness output so the configured and effective service boundary are exposed truthfully.
- [x] (2026-03-11 00:05+00:00) Added focused test coverage for config parsing, service-access prompting, Linux systemd unit rendering, setup flow prompts, lifecycle reporting, install-context detection, and runtime awareness/status surfaces.
- [x] (2026-03-11 00:08+00:00) Resolved the remaining node regression in `tests/node/runtime.test.ts` by updating the `/status` fixture to include the explicit systemd install context expected by the new awareness assertions.
- [x] (2026-03-11 00:14+00:00) Updated the required operator-facing and contributor-facing docs so setup guidance, security wording, troubleshooting, lifecycle reporting, provider/tool interface docs, test inventory, and sample config all explain the new Linux-only systemd filesystem boundary accurately.
- [x] (2026-03-11 00:19+00:00) Ran `pnpm verify:all`, fixed three follow-up regressions (docs test inventory, doctor JSON version/context expectation, and the systemd template contract test), and re-ran `pnpm verify:all` successfully.
- [x] (2026-03-11 01:07+00:00) Recovered the stalled PR follow-up: fixed the uncommitted CI drift (quickstart saved-summary service boundary line and launchd-aware doctor expectation), addressed the four outstanding PR review comments, and re-ran `pnpm verify:all` successfully.
- [x] (2026-03-11 01:18+00:00) Fixed the remaining Ubuntu-only PR regression by aligning the saved quickstart summary with the concise Linux service-mode label already used in the review step, added a platform-forced node summary test for Linux labels, and re-ran `pnpm verify:all` successfully.
- [x] (2026-03-11 02:01+00:00) Fixed the last Ubuntu-only node test regression on PR #35 by inserting the Linux-only wizard service-mode answer into the scripted CLI setup-wizard transcript, then re-ran `pnpm verify:all` successfully before pushing the follow-up.
- [ ] Commit the branch, push it, open the PR, and monitor CI/review until all required checks and review gates are satisfied.

## Surprises & Discoveries

- Observation: the existing root-installed Linux systemd unit already ran as real root while still denying broad host writes because the template used `ProtectSystem=strict` plus a narrow `ReadWritePaths` allowlist.
  Evidence: `apps/openassist-cli/src/lib/service-manager.ts` and `deploy/systemd/openassistd.service` already rendered filesystem hardening even for the system service path.

- Observation: the daemon needed both configured and effective service mode values because manual runs, dev runs, and stale services cannot truthfully infer the live systemd sandbox from config alone.
  Evidence: `apps/openassistd/src/install-context.ts` now reports `serviceManager="unknown"` and `systemdFilesystemAccessEffective="unknown"` when the service-set environment variables are absent.

- Observation: the lifecycle-report JSON schema also had to move forward because service filesystem access now appears in the shared lifecycle context.
  Evidence: `apps/openassist-cli/src/lib/lifecycle-readiness.ts` now emits `LifecycleReport.version = 3` and includes `context.serviceFilesystemAccess`.

- Observation: one runtime node test still expected a hand-crafted `/status` fixture without the new install-context fields, so the new awareness assertions surfaced a stale fixture rather than a runtime bug.
  Evidence: `tests/node/runtime.test.ts` failed until the `/status` test install context added `serviceManager: "systemd-user"` and `systemdFilesystemAccessEffective: "hardened"`.

- Observation: the bundled GitHub helper scripts still choke on Windows console decoding when PR comments or CI logs contain non-CP1252 bytes, so direct `gh` API/log calls were more reliable for this recovery pass.
  Evidence: `C:\Users\dange\.codex\skills\gh-address-comments\scripts\fetch_comments.py` and `C:\Users\dange\.codex\skills\gh-fix-ci\scripts\inspect_pr_checks.py` both failed under `cp1252` decoding until the PR state was inspected with raw `gh api` and `gh run view` commands.

- Observation: the two red CI jobs on PR #35 were not new product bugs. Ubuntu was missing the service-boundary line in the saved quickstart summary, while macOS still asserted a Linux systemd label in doctor JSON.
  Evidence: `apps/openassist-cli/src/lib/setup-summary.ts` needed the persisted `serviceFilesystemAccess` line, and `tests/node/cli-root-commands.test.ts` needed a platform-aware expectation for launchd.

- Observation: a second Ubuntu-only regression remained after that first follow-up because the saved quickstart summary was reusing the lifecycle-report value, while the interactive review step already used the shorter Linux choice label.
  Evidence: `apps/openassist-cli/src/lib/setup-summary.ts` needed to derive the Linux summary label from `describeSystemdFilesystemAccess(...)`, and `tests/node/cli-setup-validation-coverage.test.ts` now forces `platform: "linux"` to cover that branch on non-Linux development hosts.

- Observation: one more Ubuntu-only failure remained after the summary fix because the CLI setup-wizard node test still assumed the pre-Linux-prompt runtime answer order, so the scripted data-directory path was being consumed as `service.systemdFilesystemAccess`.
  Evidence: `tests/node/cli-setup-wizard.test.ts` now inserts a Linux-only `"hardened"` answer before the runtime path prompts, matching the real wizard flow when `process.platform === "linux"`.

## Decision Log

- Decision: keep `full-root` and Linux systemd filesystem access as separate persisted concepts instead of making one imply the other.
  Rationale: policy access answers who may use powerful OpenAssist tools, while service mode answers what the daemon process may do at the host boundary. Collapsing them would hide real Linux service behavior and would remain inaccurate for launchd or manual runs.
  Date/Author: 2026-03-10 / Codex

- Decision: default the new `[service].systemdFilesystemAccess` setting to `"hardened"` and only expose it as an operator choice on Linux.
  Rationale: this preserves the safer existing default and avoids inventing a meaningless launchd toggle on macOS.
  Date/Author: 2026-03-10 / Codex

- Decision: make unrestricted mode remove the OpenAssist-added systemd filesystem hardening directives entirely instead of trying to selectively poke holes for package-manager paths.
  Rationale: operators who opt into unrestricted mode are explicitly asking for real host writes and package installs from full-access sessions. Partial allowlists would remain brittle, distro-specific, and misleading.
  Date/Author: 2026-03-10 / Codex

- Decision: have quickstart and wizard both warn that unrestricted mode is Linux systemd-specific and still does not repair broken hosts, read-only mounts, or missing passwordless `sudo`.
  Rationale: the feature must improve operator control without creating a false promise that OpenAssist can override host failures.
  Date/Author: 2026-03-10 / Codex

- Decision: make setup post-save rewrite the Linux service unit before restart whenever the saved service filesystem mode changes.
  Rationale: otherwise config and live service behavior can drift, and `/status` would continue to report the old effective boundary until the operator remembers to reinstall the service manually.
  Date/Author: 2026-03-10 / Codex

- Decision: centralize the service-boundary fallback builder in `packages/core-runtime/src/awareness.ts` and reuse it from `packages/core-runtime/src/runtime.ts`.
  Rationale: the PR review correctly identified that the live awareness builder and the stored bootstrap fallback had duplicated service-boundary note logic, which risked drifting operator/model messaging over time.
  Date/Author: 2026-03-11 / Codex

- Decision: keep quickstart's saved summary on Linux aligned with the review-step choice labels (`Hardened systemd sandbox` / `Unrestricted systemd filesystem access`) instead of echoing the more verbose lifecycle-report value.
  Rationale: the quickstart summary line already names the Linux boundary explicitly, so repeating `Linux` or a `service manager not confirmed` suffix in the value is noisier than the review step and broke the Linux-specific expectations for the saved transcript.
  Date/Author: 2026-03-11 / Codex

## Outcomes & Retrospective

The core behavior is implemented. OpenAssist now has an explicit Linux-only systemd filesystem mode in config and setup, the runtime reports both configured and effective service boundaries, and lifecycle output can finally explain why a full-access chat session may still be blocked from package installs or wider host writes.

The PR follow-up work is complete locally. The stalled CI fix has been recovered, the outstanding review comments have been addressed in code and docs, the Ubuntu-only quickstart-summary drift has been fixed with a platform-forced regression test, the final Ubuntu node-test transcript drift has been corrected, and `pnpm verify:all` is green again after the latest follow-up patch set. The remaining work is now the outbound release discipline only: commit, push, and clear the live PR threads/checks.

## Context and Orientation

OpenAssist spans two closely related but distinct control planes. The first is policy access, which lives in the runtime and determines which sender may use which OpenAssist tools in a given chat. Those concepts live mainly in `packages/core-types/src/runtime.ts`, `packages/core-runtime/src/runtime.ts`, `packages/core-runtime/src/awareness.ts`, and the CLI setup helpers under `apps/openassist-cli/src/lib/`. The second is service-level process hardening, which lives in the Linux service-manager logic under `apps/openassist-cli/src/lib/service-manager.ts` and the systemd template at `deploy/systemd/openassistd.service`.

Before this change, `full-root` already meant "OpenAssist's highest tool profile" rather than "the daemon has unrestricted Unix root." That distinction was truthful in code but poorly surfaced in setup and diagnostics. Linux systemd services still ran with filesystem hardening by default, which could block `sudo`, APT state writes, or broader host writes even when the daemon user was root and the chat session had `full-root` access.

The new work introduces one explicit config knob, `[service].systemdFilesystemAccess`, with the values `"hardened"` and `"unrestricted"`. `"hardened"` preserves the existing service hardening block. `"unrestricted"` means OpenAssist does not add that Linux systemd hardening block to the unit. This setting only matters when the daemon is actually running under Linux systemd. It is not applicable under launchd, and manual/dev runs may only know the configured value while reporting the effective value as unknown.

The important implementation files are:

- `packages/core-types/src/runtime.ts` for the shared runtime/service types and awareness contract.
- `packages/config/src/schema.ts` and `packages/config/src/loader.ts` for config parsing and defaults.
- `apps/openassist-cli/src/lib/service-access.ts` for the Linux-only setup prompt and warnings.
- `apps/openassist-cli/src/lib/setup-quickstart.ts` and `apps/openassist-cli/src/lib/setup-wizard.ts` for onboarding and editing flows.
- `apps/openassist-cli/src/lib/setup-post-save.ts`, `apps/openassist-cli/src/commands/setup.ts`, and `apps/openassist-cli/src/commands/service.ts` for service rewrites after config changes and explicit service install behavior.
- `apps/openassist-cli/src/lib/service-manager.ts` plus `deploy/systemd/openassistd.service` for the rendered systemd unit and service environment.
- `apps/openassistd/src/install-context.ts` and `apps/openassistd/src/index.ts` for effective service-boundary detection in the daemon.
- `packages/core-runtime/src/awareness.ts` and `packages/core-runtime/src/runtime.ts` for the status and self-knowledge surfaces the model and operator see.
- `apps/openassist-cli/src/lib/lifecycle-readiness.ts` for the shared human and JSON lifecycle readiness output used by setup, doctor, and upgrade.

## Plan of Work

The first implementation slice establishes the new config and service-mode contract. `packages/core-types/src/runtime.ts` must define the Linux service-mode types. `packages/config/src/schema.ts`, `packages/config/src/loader.ts`, and `apps/openassist-cli/src/lib/config-edit.ts` must default the new config to `"hardened"`. The sample `openassist.toml` and migration import path in `packages/migration-openclaw/src/index.ts` must include the new section so fresh and migrated configs stay schema-valid.

The second slice updates Linux service installation and setup behavior. `apps/openassist-cli/src/lib/service-access.ts` provides the shared warning text and the second confirmation for unrestricted mode. `apps/openassist-cli/src/lib/setup-quickstart.ts` asks the question immediately after the operator opts into full access on Linux. `apps/openassist-cli/src/lib/setup-wizard.ts` exposes the same setting in runtime editing and chains the prompt after the existing approved-operator full-access follow-up. `apps/openassist-cli/src/lib/setup-post-save.ts` and `apps/openassist-cli/src/commands/service.ts` ensure the saved config becomes the source of truth for service installation so the unit is rewritten before restart.

The third slice makes the runtime and lifecycle output truthful. The systemd template must export the service manager kind and effective filesystem mode. The daemon install-context loader must read those values. The runtime awareness snapshot, `/status`, `/capabilities`, `/access`, and tool-status surfaces must show both configured and effective boundaries, plus a warning when Linux full access still sits behind the hardened service sandbox. The lifecycle report builder must carry the same distinction into setup summaries, doctor, and upgrade dry runs.

The final slice is verification and release discipline. Tests must cover both setup flows, config parsing, service rendering, daemon install-context behavior, runtime status surfaces, and lifecycle reporting. The docs listed in `AGENTS.md` must explain the two-layer model in operator language. After that, the branch must pass `pnpm verify:all`, then be pushed and monitored through CI and review.

## Concrete Steps

From `c:\Users\dange\Coding\openassist`:

1. Add or update the service-mode types, config schema/defaults, and sample config:

    - `packages/core-types/src/runtime.ts`
    - `packages/config/src/schema.ts`
    - `packages/config/src/loader.ts`
    - `apps/openassist-cli/src/lib/config-edit.ts`
    - `packages/migration-openclaw/src/index.ts`
    - `openassist.toml`

2. Add the Linux-only setup prompt helper and wire it into quickstart, wizard, setup post-save, and explicit service install:

    - `apps/openassist-cli/src/lib/service-access.ts`
    - `apps/openassist-cli/src/lib/setup-quickstart.ts`
    - `apps/openassist-cli/src/lib/setup-wizard.ts`
    - `apps/openassist-cli/src/lib/setup-post-save.ts`
    - `apps/openassist-cli/src/commands/setup.ts`
    - `apps/openassist-cli/src/commands/service.ts`

3. Update service installation, daemon install-context capture, runtime awareness, and lifecycle reporting:

    - `apps/openassist-cli/src/lib/service-manager.ts`
    - `deploy/systemd/openassistd.service`
    - `apps/openassistd/src/install-context.ts`
    - `apps/openassistd/src/index.ts`
    - `packages/core-runtime/src/awareness.ts`
    - `packages/core-runtime/src/runtime.ts`
    - `apps/openassist-cli/src/lib/lifecycle-readiness.ts`

4. Run focused verification while iterating:

    - `pnpm -r build`
    - `pnpm exec vitest run tests/vitest/service-access.test.ts tests/vitest/service-manager-linux.test.ts tests/vitest/service-manager-adapter.test.ts tests/vitest/setup-post-save.test.ts tests/vitest/setup-quickstart-flow.test.ts tests/vitest/setup-wizard-runtime.test.ts tests/vitest/lifecycle-readiness.test.ts tests/vitest/runtime-self-knowledge.test.ts tests/vitest/runtime-config-tools-wiring.test.ts tests/vitest/config-security-schema.test.ts tests/vitest/install-context.test.ts`
    - `node --test --import tsx/esm --test-timeout=15000 tests/node/runtime-access-mode.test.ts`
    - `node --test --import tsx/esm --test-timeout=15000 tests/node/cli-service-lifecycle.test.ts`
    - `node --test --import tsx/esm --test-timeout=20000 tests/node/runtime.test.ts`

5. Update docs and release notes:

    - `README.md`
    - `AGENTS.md`
    - `docs/README.md`
    - `docs/operations/quickstart-linux-macos.md`
    - `docs/operations/setup-wizard.md`
    - `docs/operations/install-linux.md`
    - `docs/operations/install-macos.md`
    - `docs/operations/common-troubleshooting.md`
    - `docs/operations/restart-recovery.md`
    - `docs/operations/upgrade-and-rollback.md`
    - `docs/operations/e2e-autonomy-validation.md`
    - `docs/security/policy-profiles.md`
    - `docs/security/threat-model.md`
    - `docs/interfaces/tool-calling.md`
    - `docs/interfaces/provider-adapter.md`
    - `CHANGELOG.md`

6. Run the final gate:

    - `pnpm verify:all`

7. Push and release-manage:

    - `git status --short`
    - `git add ...`
    - `git commit -m "Add Linux systemd filesystem access mode"`
    - `git push -u origin filesystem-access-service-mode`
    - `gh pr create ...`
    - monitor `gh pr checks <pr-number> --watch`

Recorded results so far:

    pnpm -r build
    ✓ workspace build completed after wiring the new config surface through the migration package

    pnpm exec vitest run tests/vitest/service-access.test.ts tests/vitest/service-manager-linux.test.ts tests/vitest/service-manager-adapter.test.ts tests/vitest/setup-post-save.test.ts tests/vitest/setup-quickstart-flow.test.ts tests/vitest/setup-wizard-runtime.test.ts tests/vitest/lifecycle-readiness.test.ts tests/vitest/runtime-self-knowledge.test.ts tests/vitest/runtime-config-tools-wiring.test.ts tests/vitest/config-security-schema.test.ts tests/vitest/install-context.test.ts
    ✓ focused Vitest coverage passed

    node --test --import tsx/esm --test-timeout=15000 tests/node/runtime-access-mode.test.ts
    ✓ passed

    node --test --import tsx/esm --test-timeout=15000 tests/node/cli-service-lifecycle.test.ts
    ✓ passed

    node --test --import tsx/esm --test-timeout=20000 tests/node/runtime.test.ts
    ✓ passed after updating the `/status` fixture to include the explicit systemd install context

    pnpm verify:all
    ✓ workflow lint, workspace build, lint, typecheck, Vitest, Node tests, and both coverage gates

## Validation and Acceptance

Acceptance is behavior-based:

1. On Linux, quickstart must present `Hardened systemd sandbox (recommended)` and `Unrestricted systemd filesystem access (advanced)` after the operator opts into `Full access for approved operators`. Choosing unrestricted must require a second explicit confirmation before save.
2. On Linux, wizard runtime editing must expose the same service setting, and the existing approved-operator follow-up path must chain into the service-mode prompt when it auto-switches from standard mode to full access.
3. `openassist service install` must read `[service].systemdFilesystemAccess` from config and install a matching Linux systemd unit. `hardened` must preserve the filesystem hardening directives; `unrestricted` must omit them.
4. `openassist doctor`, setup summaries, `/status`, `/capabilities`, `/access`, `GET /v1/tools/status`, and `openassist tools status` must all show the same service-boundary truth: service manager, configured Linux systemd filesystem access, effective Linux systemd filesystem access, and explanatory notes when hardened mode can still block package installs or wider host writes.
5. Launchd and manual/dev runs must remain truthful. launchd should report the Linux setting as not applicable. Manual/dev runs should not guess the effective service mode.
6. The sample config, docs, and changelog must explain that `full-root` is OpenAssist's highest tool profile, not a promise of unrestricted Unix root writes, and that Linux systemd filesystem access is a separate service-level boundary.

## Idempotence and Recovery

This change is safe to retry. Re-running quickstart or wizard only rewrites config and, on Linux, re-renders the service unit to match the saved setting. If an operator chooses the wrong Linux service mode, they can rerun `openassist setup wizard`, edit `Basic runtime and access mode`, save again, and let setup rewrite the service before restart.

If a systemd unit predates this change or drifts from config, `openassist service install --install-dir ... --config ... --env-file ...` is the safe reconciliation command because it re-renders the unit from the current config. Unrestricted mode still does not guarantee success on a broken host. If `/run` or package-manager paths are mounted read-only, or `sudo -n` is unavailable, the correct recovery path remains host repair, not more OpenAssist access.

## Artifacts and Notes

The most important proof points for this change are:

- a Linux quickstart or wizard transcript showing the new systemd filesystem prompt and the second unrestricted confirmation,
- a rendered Linux systemd unit that includes the new environment markers and omits filesystem hardening in unrestricted mode,
- a `/status` or `openassist tools status` sample showing configured and effective service boundaries separately,
- a lifecycle summary or `openassist doctor` report warning that full access can still be blocked by the hardened Linux systemd sandbox,
- the final `pnpm verify:all` output and the green PR checks once the branch is pushed.

## Interfaces and Dependencies

At completion, the following interfaces and behaviors must exist:

- `packages/core-types/src/runtime.ts` exports `RuntimeSystemdFilesystemAccess`, `RuntimeServiceManagerKind`, and a `service` section on `RuntimeConfig`, and the awareness snapshot includes a `service` object with manager, configured mode, effective mode, and notes.
- `apps/openassist-cli/src/lib/service-access.ts` exports the Linux-only setup prompt helpers and descriptive warning strings used by both quickstart and wizard.
- `apps/openassist-cli/src/lib/service-manager.ts` can render Linux systemd units from both the chosen service manager kind and the chosen filesystem mode.
- `deploy/systemd/openassistd.service` exports `OPENASSIST_SERVICE_MANAGER_KIND` and `OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS` into the daemon environment.
- `apps/openassistd/src/install-context.ts` derives the effective service boundary from those environment variables without guessing during manual or dev runs.
- `packages/core-runtime/src/runtime.ts` and `packages/core-runtime/src/awareness.ts` keep `/status`, `/capabilities`, `/access`, and tool-status output aligned with the same service-boundary contract.
- `apps/openassist-cli/src/lib/lifecycle-readiness.ts` includes the Linux service filesystem boundary in the shared human and JSON lifecycle readiness output.

Revision note (2026-03-11): Created the initial ExecPlan after the implementation was already underway so the work could still be finished in compliance with `.agents/PLANS.md`, with current progress and focused test evidence recorded before the final docs and verification pass.
Revision note (2026-03-11): Updated the plan after the docs sync and final local verification pass to record the added operator/security/testing docs, the `pnpm verify:all` result, and the small follow-up fixes required by that full gate.
