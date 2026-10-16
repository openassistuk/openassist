# Tighten Anthropic integration and finish release bookkeeping


This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current as evidence arrives.

## Purpose / Big Picture


Keep OpenAssist's official Anthropic SDK adapter current and reliable before the operator chooses how to spend newly available API credits. Operators should be able to select verified Claude models and thinking settings, preserve complete tool/thinking turns across restart, and avoid SDK logging outside OpenAssist's redaction boundary. Finish the already authorized v0.2.3 release bookkeeping without changing its signed assets. The user will decide live testing later: no paid requests, account changes or credential discovery are authorized in this task.

## Progress


- [x] (2026-10-16 baseline) Synchronize clean main at `2bc0d4ec6d0fe1162103493c545117e622ac61b3`, remove the proven merged availability branch and verify exact-main CI `38899216904`/full CodeQL `38899216898`. Frozen installation, fresh zero production/full audits and 110 focused local tests pass; open PRs/issues/scanner alerts/review threads are zero.
- [x] (2026-10-16 investigation) Inspect the adapter, shared model catalog, setup wiring and existing request/replay tests. Explain the official SDK/API-key setup to the user. Verify npm latest SDK `0.135.0`, compared with source `0.132.1`; current published v0.2.3 contains the earlier `0.131.0`. Discover missing `claude-haiku-5-5` through current official model/thinking documentation.
- [x] (2026-10-16 branch) Create `codex/tighten-anthropic-2026-10-16`; work as a single agent. Record the user's decision to defer live/paid testing.
- [x] (2026-10-16 implementation) Reproduce fourteen new failing behavior cases before fixes, then update SDK to 0.135.0, add verified Haiku 5.5 controls, API-safe tool-name translation, complete bounded/scoped replay and explicit transport/logging/tracing isolation. Preserve saved models, manual budgets, canonical audit names and runtime policy ownership.
- [x] (2026-10-16 housekeeping) Refresh only the public v0.2.3 body from PR #83's merged notes. Compare all sixteen asset identities/names/sizes/digests and exact tag commit unchanged. Reconcile PR #83 final head/actual-main checks and record PR #84 under Unreleased.
- [x] (2026-10-16 targeted checks) Build successfully, install with the frozen lockfile, pass 123 tests across four focused Vitest suites and 15 Node provider/dependency contracts. A real SDK/loopback HTTP runtime test executes two writes once and preserves the complete turn/results after closing and reopening SQLite.
- [x] (2026-10-16 documentation) Synchronize affected operator/interface/security/testing documentation, including primary model fields, rollback compatibility and the published/source distinction.
- [ ] Run the unchanged full quality/coverage/audit gate and review the final diff for accidental edits, regressions or secrets.
- [ ] Open/attach the implementation PR, record its actual final-head checks and separate scanner/review-thread results, and preserve required main review before merge. Keep live provider/channel verification explicitly pending.

## Surprises & Discoveries


PR #84 updates four dependencies but adds no changelog entry. PR #83 merged on October 10 as `a910c6fdf2e7ff95d66c5809f23fb5b2508d78fe`; its release plan still lists review/merge and release-body refresh as unfinished. The public v0.2.3 release has sixteen published assets and successful four-target verification, but its body still contains preparation wording. Metadata reconciliation must not rebuild or replace signed artifacts.

Anthropic publishes Haiku 5.5 as `claude-haiku-5-5`, released October 7. It defaults to adaptive thinking and medium effort, supports all five effort levels and a 128000-token API output ceiling, and rejects manual budgets/non-default sampling. Disabled thinking is accepted only at high effort or below. Its signed thinking also binds to the preceding request prefix, so OpenAssist's changing runtime instructions and bounded history require the same explicit stale-block handling used for the other newer models. The current catalog omits it.

The original adapter recorded complete content blocks only when a response contained thinking, losing the original grouping of multiple tool calls without thinking. Its canonical dotted names also violate Anthropic's ASCII tool identifier contract. Regression fixtures now prove complete turns and grouped results survive reconstruction while deterministic names return to canonical policy/audit names. SDK environment defaults could redirect the endpoint or supply competing credentials/headers and debug logging. SDK 0.134 also introduced automatic OpenTelemetry spans when a global tracer exists; a registered-tracer regression reproduced one span before explicit opt-out.

SDK 0.135.0 was released October 15 and is inside pnpm's release-age window at installation time. pnpm adds one exact-version exception, `@anthropic-ai/sdk@0.135.0`, after verifying the official release/changelog. Global freshness policy, build allowlist and security overrides remain unchanged. OpenTelemetry is an SDK transitive dependency; no new direct production dependency or tracing export is enabled. The initial focused logs recorded nine and eight failures with three overlapping auth cases (fourteen distinct new cases); the final focused run is 123/123 and Node contracts are 15/15.

## Decision Log


Decision (2026-10-16): use Anthropic's existing TypeScript SDK and Messages API. Keep OpenAssist's own bounded, policy-gated tool executor; do not switch to a vendor agent/tool runner or enable server tools, browser/computer use, raw thinking display or automatic prompt caching.

Decision (2026-10-16): preserve existing model IDs and compatible saved tuning. Add only officially verified catalog behavior. Retain the existing Sonnet 5.5 adaptive-only integration contract; adding its separate between_tools mode is a distinct feature rather than necessary to repair this adapter. Haiku 4.5 remains active without an announced retirement; an earliest-retirement commitment is not a retirement date.

Decision (2026-10-16): do not make paid API calls or inspect the user's credentials. Real credits do not authorize arbitrary spending. Validate with the real SDK against isolated HTTP/SSE fixtures; document what those checks prove and leave live model/account testing for the operator's later decision.

Decision (2026-10-16): refresh only the GitHub release description from the already reviewed v0.2.3 notes. Put source dependency/integration changes in Unreleased and a normal protected PR. No new release, tag change, signing operation or repository protection change is part of this task.

Decision (2026-10-16): reserve the `oa__` wire-name prefix and hash incompatible/reserved canonical names with SHA-256. Version new replay names as `sha256-v1`, scope them to provider/model, and cap opaque blocks at one MiB/256 entries. Legacy unversioned names remain literal and are translated on read. Older adapters cannot interpret the new marker; rollback requires compatible model/tuning and a fresh conversation or matching pre-update state backup while retaining current audit history.

## Outcomes & Retrospective


Implementation, targeted regression checks and release housekeeping are complete. The full local gate and hosted PR evidence remain pending. Official SDK transport stays in place; OpenAssist retains its own bounded policy-gated executor. No live Anthropic call or credential access has occurred. Published v0.2.3 remains immutable at `cc29135a8cddf45e032dd235a86cf8f854a6f124`; current source improvements require a future release to reach packaged installations.

## Context and Orientation


`packages/providers-anthropic/src/index.ts` translates OpenAssist's common chat contract into Anthropic Messages, authenticates explicitly, folds SDK streams into completed replies and stores opaque replay blocks. `packages/config/src/provider-models.ts` is the shared source for verified model IDs, thinking modes/efforts, output limits, lifecycle validation and setup/status wording. Core contracts live in `packages/core-types/src/provider.ts`; daemon wiring is in `apps/openassistd/src/main.ts`. CLI setup reads that same catalog. Keep module boundaries and the default Opus 5.5 recommendation intact.

The runtime executes tool calls sequentially and records intent/results durably. Adapter changes must preserve complete assistant tool turns and results after audit reconstruction without executing a tool twice. Existing provider metadata remains subject to runtime provider/model scoping and one-MiB/256-item bounds. `tests/vitest/provider-anthropic-tool-mapping.test.ts`, `provider-auth-contracts.test.ts`, `current-provider-models.test.ts` and `provider-model-catalog.test.ts` cover request, authentication and model behavior; Node runtime contracts cover durable tool execution/restart.

## Plan of Work


First establish authoritative SDK/model behavior using the official TypeScript SDK, model overview, Haiku migration, effort, thinking and lifecycle pages checked October 16. Confirm exact Haiku modes, effort conflicts, output limits and prefix-binding request shape. Inspect SDK release/type changes before selecting the narrow adapter changes. An offline regression must demonstrate each behavioral defect before the fix.

Next update the existing SDK dependency and frozen lockfile, then implement catalog/request/replay fixes. Cover default and explicit thinking, high-effort conflicts, manual-budget rejection, sampling omission, durable multi-tool replay with and without thinking, credential isolation and SDK logging. Preserve existing compatible models, output bounds, host policy and sequential audited execution. Do not add a production dependency or a new public API unless evidence requires it.

Then reconcile v0.2.3's actual PR #83 merge/check evidence and update its GitHub body from the merged notes, comparing asset identities/digests before and after. Update Unreleased for PR #84 and this source change. Synchronize README/AGENTS/docs index, all provider-route/auth-related required guides, configuration/setup references if catalog controls change, provider/tool interfaces, security and testing documentation. Keep packaged versions distinct from source dependencies and live testing unverified.

Finally commit source/doc changes before source-clone fixtures, run the unchanged mandatory full gate, inspect the diff and open one implementation PR. Record final-head hosted conclusions in its body rather than repeatedly pushing evidence-only commits. Required main review remains enforced; no admin bypass or self-fabricated approval is permitted.

## Concrete Steps


Work in `C:/Users/dange/Coding/openassist` with Node `24.21.0` and pnpm `12.5.1`. Keep generated diagnostic files under ignored `coverage/`; never print credentials.

    pnpm view @anthropic-ai/sdk version --json
    pnpm --filter @openassist/providers-anthropic add @anthropic-ai/sdk@^0.135.0
    pnpm install --frozen-lockfile
    pnpm exec vitest run tests/vitest/provider-anthropic-tool-mapping.test.ts tests/vitest/provider-auth-contracts.test.ts tests/vitest/current-provider-models.test.ts tests/vitest/provider-model-catalog.test.ts
    pnpm exec tsx --test tests/node/runtime-provider-tool-contracts.test.ts tests/node/dependency-security-overrides.test.ts tests/node/dependency-audit.test.ts
    pnpm verify:all
    git diff origin/main --check

After comparing reviewed notes with actual publication evidence, use `gh release edit v0.2.3 --notes-file <reviewed-notes-copy>` for the description only, then prove the sixteen asset names/sizes/digests and tag commit are unchanged. Normal PR creation/push and its checks follow local completion; never claim that PR evidence certifies the already published package contents.

## Validation and Acceptance


The new SDK installs with the frozen lockfile and unchanged build permissions. Cataloged Haiku 5.5 selections appear in setup and carry verified thinking/effort/output behavior through schema, status and actual SDK HTTP/SSE payloads. Invalid settings fail before transport. Multi-tool turns survive persistence/reconstruction with each call/result exactly once and correct Anthropic grouping. Existing signed-thinking, image, authentication and manual-budget contracts pass. Full quality, coverage and audits pass without weakened thresholds; hosted Linux/macOS/Windows quality, CodeQL, live macOS and four artifact/signing checks certify their actual final head. v0.2.3's description matches its reviewed published notes while its tag and assets remain unchanged. Live/account/provider performance is not claimed.

## Idempotence and Recovery


Source changes are isolated on a branch and can be reverted normally. Frozen installation is repeatable. GitHub description editing is a reversible metadata update, with the original body and public asset metadata retained under ignored diagnostics. Do not modify operator config, credentials, databases or services. Do not loosen protection, suppress alerts, lower coverage/audit gates, move tags or replace released assets.

## Interfaces and Dependencies


Use the existing Anthropic SDK, provider adapter and shared catalog. Preserve `ProviderAdapter.chat` and its completed `ChatResponse`, optional provider-scoped replay metadata, image capability gating and runtime tool-policy ownership. Any need to change common contracts or expose a new tuning mode must be justified by verified API behavior and updated consistently across schema, setup, status, tests and operator docs.

## Artifacts and Notes


Official sources checked October 16: https://platform.claude.com/docs/en/models/overview, https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide, https://platform.claude.com/docs/en/build-with-claude/thinking, https://platform.claude.com/docs/en/build-with-claude/effort, https://platform.claude.com/docs/en/about-claude/model-deprecations and https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript. They document Haiku's verified model/settings, prefix constraints and SDK transport/logging; npm's stable tag is `0.135.0`. API credits/live behavior are intentionally untested.

Revision note (2026-10-16): initialize from the exact merged-main audit, current official Anthropic evidence and explicit user scope. Separate authorized source/housekeeping work from the user's deferred live testing and immutable published packages.

Revision note (2026-10-16 implementation): record reproduced defects, passing native SDK/runtime restart evidence, exact-version freshness exception, legacy replay/rollback behavior and completed immutable release-body reconciliation. Full local/hosted gates remain pending.
