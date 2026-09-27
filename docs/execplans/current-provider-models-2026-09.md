# Refresh current provider models and their request contracts

This living ExecPlan follows `.agents/PLANS.md` and supplements the merged modernization plan. Work is single-agent. The user authorized a new branch and PR, but no production changes or paid live tests.

## Purpose / Big Picture

Operators can select the current GPT-6 and Claude models with controls that match each provider's documented API. Azure deployments retain operator-supplied names and explicit underlying-model hints. Existing model IDs, credentials, data, and access policy remain unchanged. Fresh recommendations and retirement repair guidance become current.

## Progress

- [x] (2026-09-27) Follow-up audit confirmed current stable channel/provider SDK versions against npm and upstream releases; Vitest 5.0.2 is the only applicable stable direct upgrade. Baileys latest remains a release candidate; Node types remain on 24.x.
- [x] (2026-09-27) Follow-up implemented: bounded/scoped Responses reasoning and phase replay, delayed-401 refresh reuse, Anthropic workspace selection and bearer-token isolation, Discord clientReady and Vitest 5.0.2. Focused payload/auth/setup tests and runtime database-reopen tests pass; frozen installation passes.
- [ ] Complete the follow-up full gate and hosted checks, and update PR #61 with final evidence.

- [x] (2026-09-27) Inspected clean main at 7e42961 and created `codex/current-provider-models` after fetching origin.
- [x] (2026-09-27) Verified official GPT-6 Sol/Luna specifications, Claude Opus 5.5/Fable 5.1 specifications and migration contracts, and Azure reasoning documentation.
- [x] (2026-09-27) Implemented shared current models, route-specific efforts/modes, schema/daemon/setup/status mapping, output budgets and Claude stream folding.
- [x] (2026-09-27) Added payload, thinking replay, output validation and wizard tests; updated required documentation and exact test inventory.
- [x] (2026-09-27) Reviewed the final implementation and passed `pnpm verify:all` on f000816 with documentation-only follow-ups. Both dependency audits report zero findings.
- [x] (2026-09-27) Published [PR #61](https://github.com/openassistuk/openassist/pull/61) and confirmed dispatch of three-platform quality, workflow lint, CodeQL and live macOS LaunchAgent checks. Hosted completion is tracked on the PR; dispatch alone is not a passing result.

## Surprises & Discoveries

The stable channel/provider dependencies were already current. The harness still discarded Responses reasoning/phase items, however, and the forced OAuth retry looked up current auth instead of the credential that actually failed. A deterministic delayed-401 test now proves one refresh across two overlapping requests. Anthropic multi-workspace keys need a workspace header, and its SDK can otherwise combine explicit API-key auth with ambient bearer auth; explicit credential selection now disables the unused kind. Durable metadata is verified after SQLite close/reopen, including the extra audit fields storage adds.

The previous catalog lacked GPT-6 Sol/Luna and Claude Opus 5.5/Fable 5.1. The latter Claude models always think and bind thinking blocks to earlier system/tools/messages. OpenAssist updates bounded runtime guidance and trims history; blindly replaying those blocks can therefore fail even though simple first-reply tests pass. Anthropic documents the `thinking-binding-controls-2026-08-01` header and `thinking.block_binding.prefix_mismatch_behavior=drop_block` to retain valid blocks and remove invalid ones at the API boundary. Model switches are handled by the API's model-binding check.

OpenAI and Azure document Standard/Pro execution independently of reasoning effort. Codex account-login availability must not be inferred from the API. Azure's feature table and OpenAI's model-specific Astra documentation disagree about `none`; keep separate route entries following each platform's official contract. Azure lists none for its Astra deployment; OpenAI excludes it. No live Azure claim is made.

The SDK rejected a 32000-token non-streaming request before transport. New always-thinking models and all larger Claude budgets now use SDK streaming folded back into the completed-message contract. Regression tests cover empty signed blocks, tools/results and restart-equivalent replay metadata.

Full verification caught the source sample still naming Terra while the fresh-config seed used Sol; lifecycle detection consequently treated a clean clone as customized legacy state. Updating the tracked sample restored the existing upgrade test without weakening it. Existing adapter behavior that omits unsupported reasoning effort is preserved; saved configuration still receives strict validation.

## Decision Log

The user expanded PR #61 to cover the local harness, authentication and channels. Current provider SDKs and channel packages already match stable releases. Retain Baileys 6.7.24 instead of its 7.0.0 release candidate. Update Vitest and coverage together to 5.0.2. Keep existing API-key, device/callback OAuth and Azure host identity routes; new enterprise workload federation/access-token flows are optional separate product features, not prerequisites for the current model routes. Add Anthropic workspaceId because new multi-workspace keys require that header. Preserve legacy keys and isolate explicit auth from SDK environment fallback. Responses replay must remain opaque, bounded, provider/model-scoped and compatible with existing tool audit rows, without introducing server-side conversation state or larger runtime history.

Preserve the existing workload tiers: fresh OpenAI/Codex setup moves from Terra to GPT-6 Sol, with Astra and Luna alternatives. Keep Sonnet 5 as the balanced Anthropic default and refresh its alternatives to Opus 5.5, Fable 5.1 and Haiku 4.5. Add verified current models rather than every historical or specialized vendor product. Preserve saved IDs and legacy budget settings.

Retain the existing Responses-only Azure OpenAI route; Claude deployments on Microsoft Foundry use a different Messages contract and must not be mislabeled as compatible with `/openai/v1/responses`. Do not add a new provider transport as part of this refresh. No beta progress text or raw thinking is exposed to channel users.

## Outcomes & Retrospective

The follow-up harness/auth/channel implementation has passed focused verification; its full gate and hosted results are pending. The earlier counts below describe the initial model-refresh revision, not the extended follow-up.

Implementation and local verification are complete. `pnpm verify:all` passed on Windows with Node 24.21.0 and pnpm 12.5.1: workflow lint, all package builds/lint/types, 399 Vitest tests, and 185 Node integration tests (3 platform-specific skips). Vitest coverage: statements 83.04%, branches 71.53%, functions 86.54%, lines 83.24%. Node coverage: statements/lines 80.63%, branches 72.03%, functions 91.5% (107 passing coverage tests, 2 platform-specific skips). All thresholds and coverage scope remain unchanged. Production and full audits both report zero findings at every severity; reports are under ignored `coverage/audit`.

Live account availability is not certified by mocked request tests. The user's existing beta testing counts once the actual build, host, route, model, channel and exercised behaviors are recorded. Actual Node migration/rollback evidence remains in the original readiness plan's release-certification scope.

## Context and Orientation

`packages/core-types/src/provider.ts` holds contracts. `packages/config/src/provider-models.ts` owns capability metadata; `schema.ts` validates saved configuration. `packages/providers-openai-shared` constructs reasoning requests, while OpenAI, Codex, Azure and Anthropic adapters map their respective transports. Setup lives in `apps/openassist-cli/src/lib/setup-wizard.ts` and `setup-quickstart.ts`; daemon construction is in `apps/openassistd/src/main.ts`. Tests under `tests/vitest` inspect payloads with fake transports; CLI integration tests under `tests/node` verify saved settings and operator output.

## Plan of Work

Follow-up changes span shared Responses mapping and its three adapters, runtime OAuth retry, Anthropic contracts/schema/setup/daemon mapping, Discord readiness, and paired test-tool patches. Use existing providerReplay metadata for durable opaque items; cap each replay record at 1 MiB and 256 items, skip duplicate tool-call audit rows, and fall back to normal transcript mapping on malformed or oversized records. Regression tests must exercise a persisted tool turn, scope mismatch, malformed/oversized replay, delayed 401 after another refresh, explicit Anthropic workspace headers and credential isolation, and Discord's current event. Run focused tests, frozen installation and the full gate before pushing; record hosted checks on PR #61.

First update capability metadata and additive API/Azure mode contracts, including per-model defaults and mandatory adaptive thinking. Then connect schemas, daemon construction, setup and status, and fix request sampling and replay compatibility. Finally test default omission, all accepted efforts, rejection of incompatible settings, unchanged deployment names/authentication, replay after tool results/restarts/context changes, and saved configuration compatibility. Update the provider, configuration, interface, lifecycle and security documentation required by AGENTS alongside README, changelog and the documentation index.

## Concrete Steps

Run commands from the repository root with Node 24.21.0 and pnpm 12.5.1. Build workspace packages with `pnpm -r build`, run focused provider/catalog and setup tests, then run `pnpm verify:all`. The full gate includes production/full audits. Commit only reviewed task changes, push the new branch, create a PR against main and inspect quality, CodeQL and live macOS checks. No automatic merge is authorized.

## Validation and Acceptance

Fresh setup should recommend current models. GPT-6 API/Azure requests use Responses with supported reasoning and omit unsupported sampling; Codex keeps its streaming/account transport. Opus 5.5 and Fable 5.1 reject disabled/manual thinking locally and preserve complete tool-use replies, including empty signed thinking. Unknown IDs never inherit capabilities. Existing configurations round-trip without rewriting model IDs. Full verification must pass with unchanged coverage gates and zero audit findings; missing live credentials remain explicitly pending.

## Idempotence and Recovery

All work is on a new branch. Tests use temporary state and fake network responses. Existing operator installations and GitHub settings are untouched. Reverting the PR restores the earlier catalog; remove newly configured additive fields before running an older build if necessary.

## Artifacts and Notes

Primary sources checked on 2026-09-27: OpenAI `/api/docs/models/gpt-6-sol`, `/gpt-6-luna`, `/gpt-6-astra`, `/api/docs/guides/reasoning`; Codex `https://learn.chatgpt.com/docs/models`; Anthropic `/docs/en/models/overview`, `/models/opus-5-5/migration-guide`, `/models/fable-5-1/overview`, `/build-with-claude/effort`, `/build-with-claude/preserved-thinking`; Microsoft `https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning`. Exact verified controls and any contradictions will be recorded in model-compatibility documentation.

## Interfaces and Dependencies

Use the installed OpenAI/Anthropic SDKs and existing Zod schemas. No new dependencies or database migration are needed. Add capability fields only to core-types, with shared lookup/validation in config. Keep optional provider-specific settings additive and default-omitting.

Revision (2026-09-27): created with source-backed compatibility findings before implementation.
