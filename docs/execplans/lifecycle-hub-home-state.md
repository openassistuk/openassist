# Lifecycle Hub and Out-of-Repo State Layout

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, a beginner operator can install OpenAssist, run `openassist setup`, and stay inside one coherent lifecycle system instead of having to guess whether to use bootstrap output, quickstart, wizard, doctor, or upgrade next. Fresh installs now keep normal writable operator state outside the Git checkout, which means config, env, logs, skills, helper tools, and runtime data stop making the repo feel dirty or fragile. Older installs that still use the repo-local defaults are detected and migrated into the home-state layout when it is safe to do so.

The visible proof is straightforward. After running bootstrap on a TTY, the operator lands in the lifecycle hub instead of being thrown directly into quickstart. `openassist doctor`, quickstart summaries, wizard post-save checks, bootstrap summaries, and `openassist upgrade --dry-run` all render the same `Ready now`, `Needs action`, and `Next command` shape. A recognized old install with `openassist.toml`, `config.d`, and `.openassist` inside the repo is migrated to the new home-state layout when the target home paths are compatible.

## Progress

- [x] (2026-03-08 15:15Z) Added shared operator-path resolution in `packages/config/src/operator-paths.ts` and switched loader/runtime defaults to the canonical home-state layout.
- [x] (2026-03-08 15:15Z) Added legacy repo-local layout detection, migration, backup, install-state refresh, and post-migration service refresh logic in `apps/openassist-cli/src/lib/operator-layout.ts`.
- [x] (2026-03-08 15:15Z) Reworked bare `openassist setup` into the interactive lifecycle hub and kept `setup quickstart` / `setup wizard` as stable direct subcommands.
- [x] (2026-03-08 15:15Z) Bumped lifecycle reporting to version `2`, added per-item `stage`, and normalized human lifecycle output to `Ready now`, `Needs action`, and `Next command`.
- [x] (2026-03-08 15:15Z) Added targeted regression coverage for operator paths, legacy migration, hub routing, bootstrap contracts, doctor output, and upgrade behavior.
- [x] (2026-03-08 18:44Z) Updated `AGENTS.md`, `README.md`, `docs/README.md`, lifecycle runbooks, `CHANGELOG.md`, and the source-checkout sample config so the repo documents bare `openassist setup`, home-state defaults, automatic legacy migration, and the shared three-section lifecycle output truthfully.
- [x] (2026-03-08 18:50Z) Recovered the final node coverage gate by adding targeted CLI node coverage for bare `setup`, legacy layout migration, and local growth-state inspection; `pnpm verify:all` now passes on the branch.
- [ ] Push branch `feat/lifecycle-hub-home-state`, open the PR, monitor CI/CodeQL/review, and fix actionable findings before reporting ready.

## Surprises & Discoveries

- Observation: Treating any repo-root `openassist.toml` as legacy operator state created false-positive migrations on clean source checkouts.
  Evidence: `tests/vitest/operator-layout.test.ts` now proves that the tracked sample config alone yields `status: "none"` and only real repo-local writable state such as `.openassist/data/openassist.db` promotes the layout to `status: "ready"`.

- Observation: Moving config defaults out of the repo broke several command examples and tests that were relying on an implicit current-working-directory config.
  Evidence: `tests/node/cli-root-commands.test.ts` needed explicit `--config openassist.toml` in source-checkout paths, while operator-facing defaults now point at `~/.config/openassist/openassist.toml`.

- Observation: Commander parent-command options and child-command defaults interact in a way that can silently discard parent `--config` / `--env-file` overrides.
  Evidence: `apps/openassist-cli/src/commands/setup.ts` now merges option values with `readCommandOptions(...)` so `openassist setup --config ... show` and similar forms keep the operator-provided parent values.

## Decision Log

- Decision: Make bare `openassist setup` the beginner-facing lifecycle hub while preserving `setup quickstart` and `setup wizard` as stable scripted subpaths.
  Rationale: The user goal is to reduce operator decision load without breaking automation or direct advanced flows.
  Date/Author: 2026-03-08 / Codex

- Decision: Move canonical writable operator state to `~/.config/openassist` and `~/.local/share/openassist` instead of the repo checkout.
  Rationale: This removes the main source of confusing dirty-working-tree output for normal operators and makes config, env, logs, skills, helper tools, and runtime data survive normal repo updates more cleanly.
  Date/Author: 2026-03-08 / Codex

- Decision: Auto-migrate only the recognized old default repo-local layout and block cleanly on conflicting home-state targets or custom legacy path usage.
  Rationale: Automatic migration should be safe and predictable. Arbitrary custom layouts are still supported, but only as explicit advanced paths rather than guessed migrations.
  Date/Author: 2026-03-08 / Codex

- Decision: Keep `doctor --json` additive by preserving the grouped section shape and only adding `version: 2` plus per-item `stage`.
  Rationale: The user plan called for a unified lifecycle model without breaking the automation surface added in earlier lifecycle work.
  Date/Author: 2026-03-08 / Codex

- Decision: Normalize human lifecycle surfaces to three sections even though the machine-readable report stays stage-aware internally.
  Rationale: Beginner operators need one simple output shape. Repair logic and tests still need the richer stage model.
  Date/Author: 2026-03-08 / Codex

## Outcomes & Retrospective

The branch now has the complete local implementation required by the plan: shared operator-path resolution, safe migration of the recognized old repo-local layout, an interactive lifecycle hub behind bare `openassist setup`, and one shared lifecycle report model used by bootstrap, quickstart, wizard post-save checks, doctor, and upgrade. Docs, `AGENTS.md`, lifecycle runbooks, and changelog entries are aligned with the new home-state layout and the `openassist setup` entrypoint.

The main lesson from this pass is that lifecycle UX and state layout cannot be separated. The earlier lifecycle work made output more consistent, but leaving default writable state inside the repo still made upgrade and repair feel Git-heavy. Moving normal operator state out of the checkout is what makes the simplified lifecycle wording honest.

The final verification lesson was practical: the new lifecycle helpers needed extra node-level branch coverage, not weaker thresholds. Adding targeted node tests for bare `setup`, legacy layout migration, and local growth-state inspection recovered the gate cleanly while keeping the coverage policy intact.

## Context and Orientation

OpenAssist has two top-level executables in this repository: `openassistd`, the daemon that serves the local API and runtime, and `openassist`, the operator CLI that handles install, setup, doctor, service, and upgrade flows. The relevant code lives in `apps/openassist-cli/` and `apps/openassistd/`, while shared config loading and schema code lives in `packages/config/`.

Before this branch, many operator flows still treated the repo checkout as the default home for `openassist.toml` and other writable state. That created two user-visible problems. First, operators had to pass repo-local paths around during setup and service commands. Second, normal config/runtime writes made the repo look dirty, which then made upgrade output look scarier than it should for non-developer users.

The key implementation files are:

- `packages/config/src/operator-paths.ts`, which now defines the canonical home-state layout and is the truth source for default operator paths.
- `packages/config/src/loader.ts`, which now defaults base config and overlay lookup to the home-state layout.
- `apps/openassist-cli/src/lib/operator-layout.ts`, which detects and migrates the recognized old repo-local layout.
- `apps/openassist-cli/src/lib/setup-hub.ts`, which implements the new bare `openassist setup` hub.
- `apps/openassist-cli/src/lib/lifecycle-readiness.ts`, which builds the shared lifecycle report used by doctor, bootstrap, quickstart, wizard, and upgrade.
- `apps/openassist-cli/src/commands/setup.ts`, `apps/openassist-cli/src/index.ts`, `apps/openassist-cli/src/commands/service.ts`, and `apps/openassist-cli/src/commands/upgrade.ts`, which now consume the shared operator paths and lifecycle report.
- `scripts/install/bootstrap.sh`, which now launches the lifecycle hub on TTY installs and reads the final readiness summary from `openassist doctor --json`.

In this repository, “home-state layout” means the operator’s writable state lives under the user’s home directory, not inside the Git checkout. The canonical layout for fresh installs is:

    config: ~/.config/openassist/openassist.toml
    overlays: ~/.config/openassist/config.d
    env: ~/.config/openassist/openassistd.env
    install state: ~/.config/openassist/install-state.json
    runtime data: ~/.local/share/openassist/data
    runtime logs: ~/.local/share/openassist/logs
    managed skills: ~/.local/share/openassist/skills
    managed helper tools: ~/.local/share/openassist/data/helper-tools

“Legacy repo-local layout” means the old default arrangement where the repo checkout contained `openassist.toml`, `config.d`, and `.openassist/` writable state. This branch only auto-migrates that recognized default layout. Explicit custom paths remain supported, but they are not guessed or merged automatically.

## Plan of Work

Finish the remaining documentation and governance work so the branch is self-contained and releaseable. Update `AGENTS.md` so future lifecycle changes must preserve bare `openassist setup` as the primary lifecycle hub, must keep writable operator state outside the repo by default, must preserve the recognized automatic legacy migration behavior, and must keep the shared `Ready now` / `Needs action` / `Next command` output shape across human lifecycle surfaces.

Rewrite the operator-facing docs around one story: install from GitHub, run `openassist setup`, reach the first reply, use wizard only for deeper changes, and dry-run upgrades before live updates. Every lifecycle runbook must use the new canonical home-state paths and explain that repo-local operator state is now legacy behavior that will be migrated when safe. The root `README.md` and `docs/README.md` must clearly explain that the repo checkout is code-first while config, env, logs, data, skills, helper tools, and install state live under the home directory for normal installs.

Keep the source-checkout sample `openassist.toml` in the repo, but make its purpose explicit so it does not get confused with the installed default operator config. The docs should treat it as a source-development sample, not as the installed default path.

Once the docs are aligned, run the full verification gate from the repository root with `pnpm verify:all`. If any tests fail, fix them in the same branch. Then commit the branch, push it, open the PR, wait for GitHub CI and CodeQL to finish, inspect review feedback, and fix any actionable findings before reporting that the PR is ready to merge.

## Concrete Steps

Work from the repository root:

    cd c:\Users\dange\Coding\openassist

Targeted verification commands already used while implementing the branch:

    pnpm -r build
    pnpm exec vitest run tests/vitest/lifecycle-readiness.test.ts tests/vitest/setup-quickstart-flow.test.ts tests/vitest/setup-quickstart-validation.test.ts tests/vitest/setup-wizard-runtime.test.ts
    pnpm exec tsx --test tests/node/cli-root-commands.test.ts tests/node/cli-command-integration.test.ts
    pnpm exec vitest run tests/vitest/operator-paths.test.ts tests/vitest/operator-layout.test.ts tests/vitest/setup-hub.test.ts
    pnpm exec tsx --test tests/node/bootstrap-interactive-contract.test.ts tests/node/install-bootstrap-idempotence.test.ts tests/node/install-curl-entrypoint-contract.test.ts

Expected evidence from those targeted runs is that the new operator-path and hub tests pass, bootstrap contract tests mention `Running guided lifecycle setup`, and doctor/upgrade tests show the new shared output model without regressing existing scriptable behavior.

Final full verification command:

    pnpm verify:all

After local verification passes:

    git status --short
    git add AGENTS.md README.md docs/ README.md CHANGELOG.md apps/ packages/ scripts/ tests/
    git commit -m "feat: add lifecycle hub and home-state defaults"
    git push -u origin feat/lifecycle-hub-home-state
    gh pr create --fill

After the PR exists:

    gh pr checks --watch
    gh pr view --comments

If review comments appear, address them on the same branch, rerun the relevant tests plus `pnpm verify:all`, push again, and repeat until CI, CodeQL, and actionable review findings are all clear.

## Validation and Acceptance

Acceptance is behavioral:

1. On a TTY, running bare `openassist setup` opens the lifecycle hub and offers first-time setup, repair, advanced configuration, service actions, update planning, file locations, and exit.
2. On a non-TTY, running bare `openassist setup` prints scriptable subcommand guidance and exits non-zero without mutating config or env files.
3. Fresh installs default to `~/.config/openassist/openassist.toml` plus the `~/.local/share/openassist/...` state tree, and lifecycle docs show those paths consistently.
4. Recognized legacy repo-local installs are migrated safely into the new home-state layout when the target home paths are empty or compatible, and the old repo-local state is only cleaned up after healthy verification succeeds.
5. `openassist doctor`, bootstrap summaries, quickstart summaries, wizard post-save checks, and `openassist upgrade --dry-run` all use the same human-readable `Ready now`, `Needs action`, and `Next command` shape.
6. `openassist doctor --json` returns `version: 2` and keeps the grouped section structure while adding per-item `stage`.
7. A migrated install no longer reports repo dirtiness because of normal operator config/runtime state, but real repo code changes still block upgrade.

The final proof is:

    pnpm verify:all

and a clean PR with green GitHub checks, green CodeQL, synced docs/AGENTS, and no unresolved actionable review findings.

## Idempotence and Recovery

The shared operator-path changes are idempotent because the default path resolver is pure and can be called repeatedly without side effects. Legacy auto-migration is intentionally guarded. It only runs when the recognized old default layout is detected and when the target home-state directories are empty or compatible. If migration hits conflicting target files, it stops with a guided message instead of merging two unknown states together.

The migration routine creates a timestamped backup bundle under `~/.local/share/openassist/migration-backups/<timestamp>` before it rewrites config or copies runtime state. If service refresh or post-migration health verification does not succeed, the old repo-local writable artifacts are left in place so the operator can recover manually instead of being stranded between states.

## Artifacts and Notes

Important evidence captured during implementation:

    2026-03-08T15:15:44+00:00

    git status --short --branch
    ## feat/lifecycle-hub-home-state
     M apps/openassist-cli/src/commands/service.ts
     M apps/openassist-cli/src/commands/setup.ts
     M apps/openassist-cli/src/commands/upgrade.ts
     ...
     ?? tests/vitest/setup-hub.test.ts

    pnpm exec vitest run tests/vitest/operator-paths.test.ts tests/vitest/operator-layout.test.ts tests/vitest/setup-hub.test.ts
    ... all passed

    pnpm exec tsx --test tests/node/bootstrap-interactive-contract.test.ts tests/node/install-bootstrap-idempotence.test.ts tests/node/install-curl-entrypoint-contract.test.ts
    ... all passed

    2026-03-08T18:50:00+00:00

    pnpm verify:all
    ... passed

    pnpm test:coverage:node
    Statements   : 81.73% (10631/13006)
    Branches     : 70.58% (1358/1924)
    Functions    : 88.65% (414/467)
    Lines        : 81.73% (10631/13006)

These prove that the new home-state defaults, legacy migration behavior, and setup hub contracts are already implemented before the final docs and verification pass.

Revision note: created on 2026-03-08 to capture the lifecycle hub and home-state branch after the core implementation and targeted regression coverage were already in place, so the remaining work and evidence are explicit for the next contributor.
