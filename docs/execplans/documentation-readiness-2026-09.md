# Reconcile repository documentation before core development

This living ExecPlan follows `.agents/PLANS.md`. Work is single-agent. The user authorized a documentation branch and PR; runtime changes, merging and live production tests are outside this task.

## Purpose / Big Picture

Operators and contributors should find one consistent description of the merged application, including model controls, authentication, installation, quality gates and remaining release evidence. Update current guidance in place and preserve dated historical evidence rather than rewriting past decisions as if they described today's code.

## Progress

- [x] (2026-09-27) Started from clean main `0ac0921`; created `codex/documentation-readiness`. Confirmed PR #61 merged as `0ac0921` and #59 as `7e42961` through GitHub.
- [x] (2026-09-27) Initial audit passed all nine docs-truth checks but found stale quickstart choice lists, an incorrect cross-route reasoning summary, scattered new configuration fields and incomplete final merge records.
- [x] (2026-09-27) Reconciled root/contributor guidance, provider/configuration field lists, route-specific setup controls, architecture/interface descriptions, rollback and migration notes, audit instructions and final merge records. Swept all 90 Markdown files (44 non-ExecPlan documents and 46 plans including this one); no missing relative link paths.
- [x] (2026-09-27) Full `pnpm verify:all` passed: 406 Vitest tests, 188 Node integration passes with 3 platform skips, unchanged coverage gates and zero findings in production/full audits. Final review preserved all runtime/dependency files; documentation checks and whitespace checks pass.
- [x] (2026-09-27) Committed the documentation as `14bd441`, pushed `codex/documentation-readiness`, and published [PR #62](https://github.com/openassistuk/openassist/pull/62). Three-platform CI, workflow lint, CodeQL and the live macOS LaunchAgent gate were dispatched. Their final exact-revision results are tracked on the PR; dispatch is not evidence of a pass.

## Surprises & Discoveries

The existing documentation checks validate links, command names, indexes, test inventory, coverage and workflow wording. They do not validate every prose assertion. In particular, `docs/configuration/config-reference.md` generalized Astra's OpenAI restriction to Azure and generalized API Sol/Luna reasoning choices to Codex. The catalog explicitly separates those routes.

Further review found older model/Node recommendations still under the unreleased changelog, an audit step missing from the testing command breakdown, and context documentation claiming all provider payload segments were token-counted. `ContextPlanner` estimates normalized message text; opaque replay, images and tool schemas are not covered by that estimate. Documentation now distinguishes the separate byte/item bounds. README's checkout/setup-node v6 references are deliberately enforced minimum floors in `scripts/dev/lint-workflows.mjs`; actual workflows use v7, so the floor wording is retained.

## Decision Log

On 2026-09-27, use the merged catalog, schema, CLI registry, adapter code and workflows as implementation truth. Preserve the already dated vendor research and availability caveats; this task documents the implemented feature set rather than adding new vendor features. Put new fields in their main reference sections and use the shared compatibility matrix for route-specific choices. Keep historical changelog entries and dated plan evidence intact, adding final reconciliations where needed.

On 2026-09-27, reconcile conflicting claims inside the unreleased changelog to the final implementation while retaining the released 0.1.0 history. Keep previously reconciled historical plan checkboxes where the underlying verification evidence is absent; do not manufacture evidence from merge state. Add a practical beta evidence template rather than presenting successful generic beta use as exhaustive provider certification.

## Context and Orientation

`README.md` and `docs/README.md` are operator entrypoints; `AGENTS.md` and `CONTRIBUTING.md` define contributor discipline. `packages/config/src/provider-models.ts` defines bounded model capabilities and `packages/config/src/schema.ts` validates settings. Setup prompts live under `apps/openassist-cli/src/lib`, command registration in `apps/openassist-cli/src/main.ts` and `commands/`. Provider adapters live in `packages/providers-*`. Workflow files, `vitest.config.ts` and `package.json` define verification. Historical plans live in `docs/execplans/`; their checkboxes require actual evidence, not merely a merged PR.

## Plan of Work

First reconcile operator references and setup summaries with the shared model catalog and schema. Then review the rest of the documentation inventory for obsolete runtime, lifecycle, interface and verification claims, integrating recent appendices into the sections readers use. Finally record merged PR outcomes, retain outstanding live certification explicitly, and verify the complete documentation change before publishing.

## Concrete Steps

Run from the repository root with Node 24.21.0 and pnpm 12.5.1. Inspect tracked Markdown with `git ls-files '*.md'`, source references with `rg`, and merged evidence with `gh pr view 59` and `gh pr view 61`. Edit only documentation. Run `pnpm exec tsx --test tests/node/cli-docs-truth.test.ts`, `git diff --check` and `pnpm verify:all`. Commit on the documentation branch, push and create a PR targeting main; attach the PR to this chat.

## Validation and Acceptance

Readers must see route-specific reasoning choices, all additive configuration fields in their primary lists, current setup and runtime requirements, and accurate completed-versus-pending evidence. Local documentation checks and the full quality gate must pass without changed coverage gates. Hosted checks run on the published revision; dispatch is not a passing result. Live provider/channel checks and a real existing-install Node migration/rollback remain unclaimed unless separately evidenced.

## Idempotence and Recovery

Documentation changes are reversible through Git and do not mutate operator state. Preserve historical records and user work. Check PR state before retrying publication to avoid duplicates. Do not merge or deploy as part of this task.

## Artifacts and Notes

PR #61 head `310142d` passed CI run 36336356460, CodeQL run 36336356445 and macOS Live Launchd run 36336356428 before its 2026-09-27 merge. These are historical implementation checks, not verification of this documentation branch.

The inventory includes root README/AGENTS/CONTRIBUTING/CHANGELOG/SECURITY/CODE_OF_CONDUCT, `.agents/PLANS.md`, the PR template, the example skill, the documentation index, all provider/channel/configuration/architecture/interface/security/testing/migration/operations guides and all ExecPlans. Current model settings were checked against the catalog/schema/setup/adapters; runtime and replay descriptions against context/runtime/contracts; Node/service guidance against bootstrap and lifecycle sources; quality statements against package scripts, workflows and coverage configuration. The nine docs-truth checks pass. A separate read-only link sweep included historical plans and root contributor/policy files outside that suite's normal live-doc list: 90 files, zero missing relative link paths. External URLs were not revalidated in this documentation-only task.

Reviewed without changes: released changelog history, root security/conduct policy, ExecPlan process, example skill, the three channel guides, model-compatibility catalog, security guides, scheduler/skills/tool/channel contracts, installer/restart/upgrade guides, autonomy/chaos scenarios, and older reconciled plans. Their current contracts remain applicable; dated dependency snapshots and unproven live checks remain labeled as such. Updated documents are shown by the PR diff; unchanged files are not touched merely to refresh a date.

## Interfaces and Dependencies

No runtime interfaces, dependencies, database schemas or service settings change. Current documentation must retain credential redaction, model selection requiring explicit operator action and the Linux/macOS operator-platform boundary.

## Outcomes & Retrospective

Documentation reconciliation is implemented with no runtime, dependency or operator-state changes. The full local gate passed on Windows with Node 24.21.0/pnpm 12.5.1. Vitest coverage: statements 83.07%, branches 71.66%, functions 86.55%, lines 83.27%; Node coverage: statements/lines 80.61%, branches 71.93%, functions 91.52%. Production/full audits each report zero findings at every severity. Local log: `%TEMP%/openassist-docs-readiness-verify.log`. The standalone nine-test docs-truth suite also passes; the wider relative-link sweep found no missing paths. No live accounts, production operations or paid calls were used. Final hosted results belong to the published documentation PR and must not be inferred from these local results.

Delivery is [PR #62](https://github.com/openassistuk/openassist/pull/62), targeting main. It remains subject to hosted checks and normal review/merge policy. No merge or deployment was performed. Future provider changes should update primary guidance alongside the compatibility catalog so appendices do not leave contradictory instructions in the main sections.

Revision note (2026-09-27): Created this plan for the authorized repository-wide documentation reconciliation.

Revision note (2026-09-27, verification): Recorded the 90-document inventory, final merge reconciliations, additional prose contradictions and passing local verification. Subsequent wording-only review changes receive the focused documentation check; product code and coverage gates remain unchanged.
