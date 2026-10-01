# Audit model catalogs and refresh recommendations for October 2026

This ExecPlan is a living document maintained under `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture

Audit the complete current conversational OpenAI and Anthropic inventories, their exact aliases/pins, per-route reasoning/thinking controls and lifecycle announcements. A direct comparison with the October 1 official model/lifecycle tables found all 27 non-deprecated general-purpose OpenAI families and all 14 active Claude entries represented after the update.


Fresh OpenAI and Codex setup should suggest GPT-6.1 Sol with xhigh reasoning for OpenAssist's work across multiple tools. Fresh Anthropic setup should recommend Opus 5.5 for complex autonomous work, while offering the newly released Sonnet 5.5 as a cheaper alternative. Operators keep their saved model IDs and tuning until they explicitly edit them. Azure continues to send the operator's deployment name, and generic backends require their own served model ID.

## Progress

- [x] (2026-10-01) Pushed the expanded audit and local verification evidence to PR #75. The updated PR validation section tracks hosted checks and will record the exact final head/results before handoff; merge/publication remain separate.

- [x] (2026-10-01) Completed the reopened audit after operator review: audit every current OpenAI/Anthropic conversational family, verified aliases/snapshots, route-specific controls and announced retirements; update PR #75 with catalog, transport, setup/status, docs and regression coverage.
- [x] (2026-10-01, expanded scope) Implemented exact family/alias/pin entries, minimal effort, Claude 4.5/4.6 output/effort limits and per-route lifecycle checks. Build, product typecheck and lint passed; seven focused suites passed 118 tests. All 72 Vitest files passed 577 tests (one skipped), and targeted Node readiness/docs-truth passed 17 tests. Subsequent restricted-replay edits passed a rebuilt 76-test transport/catalog run. Full verification passed on e0faf09; exact-head hosted reconciliation is maintained in PR #75.


- [x] (2026-10-01) Confirmed official OpenAI, Codex, Microsoft and Anthropic model documentation, inspected the shared catalog, setup flows, defaults and relevant tests; created `codex/current-model-recommendations` from current main `f5e811b`.
- [x] (2026-10-01) Implemented catalog entries, fresh default reasoning, route-specific recommendations and generic setup prompts.
- [x] (2026-10-01) Added transport/catalog, quickstart/wizard creation and saved-effort tests; synchronized affected documentation and examples. `pnpm -r build` passed; eight focused Vitest files passed 98 tests.
- [x] (2026-10-01) Reviewed final changes and passed `pnpm verify:all` on implementation commit `4245c91131ae96f178ee0612a8e65a02a0e68b50`: build/workflow lint/lint/types, 544 Vitest passes (one skipped), 228 Node passes (six skipped), both coverage gates, and zero production/full audit findings.
- [x] (2026-10-01) Pushed `codex/current-model-recommendations`, created [PR #75](https://github.com/openassistuk/openassist/pull/75) against main, and attached it to the task. No merge was performed.
- [x] (2026-10-01) Recorded the initial hosted checkpoint separately: CodeQL preflight succeeded; analysis, all three quality jobs, live macOS and four package builds were queued/running. Publication checks are correctly skipped on a PR. No review threads or open code-scanning alerts were returned. Final hosted results for the latest documentation-only head must be reconciled in PR #75's validation section; this checkpoint is not a claim that remaining jobs passed.

## Surprises & Discoveries

The complete catalog audit found missing GPT-5.5/Pro, GPT-5.4 Nano/Pro, other Responses-only Pro models, the GPT-5.6 alias, Claude Opus 4.7/4.8 and Fable/Mythos 5. It also found retired API Codex IDs still presented as compatible, Sonnet 4.5's September 30 deprecation, Codex GPT-5.5's October 14 retirement and Spark's September 14 retirement. The earlier verification evidence below describes the initial implementation, not this reopened scope.


OpenAI GPT-6.1 Sol excludes none/minimal reasoning and requires Responses for tools. Microsoft's GPT-6 deployment feature matrix explicitly includes none for GPT-6.1 Sol. These are separate catalog entries, as with Astra, to avoid assuming identical route capabilities. Azure availability remains dependent on the operator's region, quota and deployment.

Sonnet 5.5 rejects disabled thinking and manual budgets. Its adaptive thinking blocks bind to the conversation prefix, so it needs the existing bounded replay and prefix-mismatch handling already used for Opus 5.5. OpenAssist supports adaptive thinking for this model; the new between_tools mode is outside this change because it needs different history-edit semantics.

Generic setup previously reused the OpenAI model default despite calling Chat Completions. GPT-6.1 Sol does not support tools through that API, so generic setup now requires the backend's model ID rather than suggesting it.

The OpenClaw importer classified the exact openai-compatible type as OpenAI because it matched an OpenAI substring first. Corrected that exact route mapping and added a visible placeholder/warning for a missing generic model. The regression verifies current absent-model defaults alongside preservation of a saved GPT-6 Sol ID.

The first full gate passed build, lint, types and all 544 Vitest tests but stopped at the clean-source upgrade integration test. That test clones committed HEAD while running the current working-tree CLI; the clone retained the pre-change model sample and the CLI's default changed. Committing the reviewed update made fixture and CLI agree, and the complete gate then passed without weakening readiness assertions or changing lifecycle production logic.

## Decision Log

On 2026-10-01, expand the audit to the full currently supported conversational inventory. Preserve saved IDs during schema parsing; separately reject retired requests/readiness and warn on scheduled retirements. Do not apply API dates to Azure/generic endpoints or interpret minimum retirement commitments as shutdown dates. Carry only exact vendor-listed snapshot capabilities to API pins. Use existing chat/tool/image transports; specialized media APIs and research-only models without verified request specifications remain outside the assistant selection catalog.


On 2026-10-01, choose GPT-6.1 Sol and xhigh for new OpenAI defaults and fresh supported setup choices, following the operator's requested preference. Xhigh is OpenAssist's recommendation; omitted reasoning still uses upstream defaults. Preserve saved explicit effort and omitted settings in repair/editor flows. Pro execution mode stays optional.

On 2026-10-01, recommend Opus 5.5 for Anthropic after reporting the research to the operator. Anthropic's September 28 announcement calls Sonnet 5.5 a faster, cheaper complement and reports Opus stronger for complex open-ended work requiring sustained judgment. This supports the recommendation without claiming Sonnet is generally poor or claiming OpenAssist-specific live benchmark results.

On 2026-10-01, keep capability metadata exact and route-specific. Add Sonnet 5.5 through existing adaptive replay rather than introducing new thinking modes, dependencies, tool features or broader context limits.

## Outcomes & Retrospective

The expanded implementation passed pnpm verify:all on e0faf093bc530fce8a39e000dc98051cd955b0e8, including workflow lint, build, lint/types, 577 Vitest passes (one skipped), 229 Node passes (six skipped), both unchanged coverage gates and zero production/full audit findings. Vitest coverage is 84.22% lines, 83.24% statements, 85.85% functions and 74.35% branches. Node coverage is 80.15% lines/statements, 86.07% functions and 73.67% branches. The exact-head hosted outcome is tracked in PR #75; earlier counts below describe the initial implementation only. The complete conversational inventory and lifecycle evidence are now in the model compatibility document.


Implementation, synchronized documentation, 98 focused tests and full local verification are complete, and PR #75 is open. Vitest coverage is 84.19% lines, 83.21% statements, 85.85% functions and 74.33% branches. Node coverage is 80.11% lines/statements, 86.38% functions and 73.45% branches. All thresholds are unchanged. Both audit reports contain zero findings. GitHub returned no open code-scanning alerts or review threads on 2026-10-01. The initial CodeQL preflight passed; other hosted jobs remain pending and final-head results are tracked in the PR. No paid provider call, operator service restart, release publication or merge was performed; fake transport tests do not certify live account availability.

## Context and Orientation


`packages/config/src/provider-models.ts` is the shared model catalog: it records the controls each exact model supports on each provider route. Provider adapters use it to map outgoing requests, config validation rejects incompatible saved controls, and setup uses it to render choices. `packages/config/src/loader.ts` and `apps/openassist-cli/src/lib/config-edit.ts` construct fresh configuration. Quickstart configures the main provider; setup wizard adds or edits providers. `packages/providers-openai-compatible` deliberately uses backend-defined Chat Completions and has no shared vendor reasoning controls.

Existing Opus 5.5 handling in `packages/providers-anthropic/src/index.ts` streams long replies internally and persists bounded opaque thinking blocks with tool results. `thinkingPrefixBinding` causes adaptive requests to use the existing documented drop-block behavior when earlier conversation context changes. This supports Sonnet 5.5 without changing storage or runtime orchestration.

## Plan of Work


First add exact GPT-6.1 Sol entries for OpenAI, Codex and Azure with each route's verified reasoning and sampling controls. Change fresh OpenAI model/reasoning constants and Anthropic model/alternatives, retain older entries, and add Sonnet 5.5 using adaptive prefix-bound thinking. Connect recommendations to fresh config and provider creation while retaining omission on existing provider edits. Generic prompts must start blank for new providers.

Next extend `tests/vitest/provider-model-catalog.test.ts`, `current-provider-models.test.ts`, `provider-azure-foundry.test.ts`, and setup tests to prove outgoing model, effort, tools, sampling and replay. Update public docs, configuration examples, README, AGENTS and changelog together. Keep prior release/live-test records intact. Add migration coverage where absent-model defaults change.

## Concrete Steps


From the repository root, using Node 24.21.0 and pnpm 12.5.1, run `pnpm -r build`, then the affected Vitest files and CLI setup/docs-truth Node suites. Run `pnpm verify:all` once implementation is complete; it includes builds, workflow lint, lint, types, both suites, mandatory coverage and production/full dependency audits. Review `git diff --check` and final staged content before committing. Push the branch, create a PR against main and attach it to this chat. Read hosted CI, CodeQL, live macOS, unresolved review threads and code-scanning alert state separately; never infer a successful baseline analysis from a diff-only result.

## Validation and Acceptance


Fresh default config contains gpt-6.1-sol and xhigh. New setup presents the same recommendation, but choosing Default omits reasoning and saved older models/efforts remain intact. OpenAI and Codex reject none for GPT-6.1 Sol; Azure accepts its documented none option only through the exact underlying-model hint. Azure wire requests keep deployment names and both API-key/Entra auth. Generic setup requires a backend-specific ID, sends no vendor-specific reasoning and keeps its existing transport.

Sonnet 5.5 accepts adaptive thinking and all five efforts, rejects disabled/manual settings locally, omits unsupported temperature, and replays signed thinking and complete tools after restart/context edits. Opus remains recommended with its existing medium provider-default effort and bounded output. Passing test reports are required evidence; hosted and live verification must be labelled separately.

## Idempotence and Recovery


Work occurs on a separate branch. Tests use temporary state and fake network calls. No database migration is needed. Rollback restores the previous build plus compatible saved model/tuning settings; a build predating these catalog entries cannot safely send optional controls for the new models. Back up operator TOML before explicitly migrating an installation.

## Artifacts and Notes


Primary sources checked on 2026-10-01: OpenAI GPT-6.1 Sol model page and GPT-6 guide; ChatGPT Learn model controls; Microsoft Azure reasoning feature table; Anthropic model overview, Opus 5.5 overview, Sonnet 5.5 announcement and migration/what's-new documentation. The exact controls and official source links are recorded in `docs/providers/model-compatibility.md`.

## Interfaces and Dependencies


Use existing core-types contracts, SDKs and shared catalog functions. Add `DEFAULT_OPENAI_REASONING_EFFORT` and `recommendedReasoningEffort(model, route)` to config exports. Add the core-types ModelLifecycle contract and optional reasoningReplay metadata, plus modelLifecycle/model-availability helpers in config. No production dependency, auth endpoint, context limit, database contract or tool-loop budget changes are needed.

Revision (2026-10-01): created after official source review and initial targeted implementation; validation and hosted evidence remain pending.

Revision (2026-10-01, implementation): recorded targeted build/test evidence, documentation reconciliation and the exact generic-import route correction. Full quality verification is running.

Revision (2026-10-01, verification): recorded the initial cloned-HEAD fixture mismatch before committing and rerunning the full gate.

Revision (2026-10-01, local completion): recorded the successful complete gate on implementation commit 4245c91, unchanged coverage thresholds and zero audit/code-scanning findings. This evidence-only update does not change product behavior.

Revision (2026-10-01, PR reconciliation): recorded actual PR creation and the initial hosted checkpoint. Subsequent final-head results belong in PR #75's validation section so recording them does not repeatedly invalidate that head's checks. No merge, release or live-provider certification is inferred.

Revision (2026-10-01, expanded audit): reopened after operator feedback, audited full vendor inventories and lifecycle tables, implemented omitted current families/verified pins and retirement handling, corrected stale recommendation prose, and recorded focused evidence before the full gate.

Revision (2026-10-01, expanded local verification): recorded the complete successful gate on e0faf09, including zero audit findings and unchanged coverage thresholds. This evidence-only revision does not alter product behavior; latest-head hosted results will be recorded in PR #75.

Revision (2026-10-01, expanded PR reconciliation): recorded the pushed implementation, complete local gate and coverage totals. Workflow lint, CodeQL preflight and Linux arm64 packaging passed on the initial pushed head 30b9135; remaining hosted jobs were running. Final results must be recorded for the exact latest head in PR #75; this checkpoint is not a claim of hosted success, publication, merge or paid-provider certification.
