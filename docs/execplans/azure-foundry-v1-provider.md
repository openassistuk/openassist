# Add Azure Foundry V1 Provider Route

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, an operator can choose `azure-foundry` as a first-class provider route in `openassist setup`, configure either API-key auth or Microsoft Entra host-credential auth, and use Azure resource-style `/openai/v1/` endpoints with the same chat, tool-loop, channel, status, and lifecycle behavior that the existing built-in providers already have. The observable proof is that quickstart and wizard can save a valid Azure Foundry config, `openassist auth status` reports truthful Azure auth readiness, runtime accepts the new provider route, and provider adapter tests prove Responses-only request construction for both API-key and Entra modes.

## Progress

- [x] (2026-04-02 14:27Z) Confirmed current provider architecture, setup surfaces, validation flow, runtime auth status path, and required documentation sync surfaces.
- [x] (2026-04-02 14:27Z) Created feature branch `codex/azure-foundry-v1-provider`.
- [x] (2026-04-02 14:27Z) Chose scope defaults: resource-style Azure endpoints only; Entra means `DefaultAzureCredential`, not linked-account OAuth.
- [x] (2026-04-02 16:08Z) Implemented `azure-foundry` config and runtime contract updates across `packages/core-types`, `packages/config`, `apps/openassistd`, CLI provider status helpers, and runtime auth-status handling.
- [x] (2026-04-02 16:28Z) Added `packages/providers-azure-foundry` with Responses-only Azure request handling, API-key auth, Entra auth, reasoning-effort gating, image support, and sanitized operator-facing failures.
- [x] (2026-04-02 17:03Z) Extended quickstart, setup wizard, summaries, and validation with Azure-specific prompts, guidance, env handling, and readiness checks.
- [x] (2026-04-02 17:36Z) Added and updated tests across provider adapter, setup flows, provider display, auth status, and runtime provider-tool contracts.
- [x] (2026-04-02 18:11Z) Updated the required operator and contributor documentation surfaces, including `README.md`, `AGENTS.md`, `CHANGELOG.md`, provider docs, config docs, operations docs, interface docs, architecture docs, testing docs, and migration notes.
- [x] (2026-04-02 18:43Z) Ran `pnpm verify:all` successfully after adding extra node integration coverage for Azure quickstart, wizard, and validation branches.
- [ ] Publish the branch, open a PR, and keep iterating until all PR checks and review findings are green.

## Surprises & Discoveries

- Observation: the existing repository has no Azure identity dependency yet, so Entra support must add `@azure/identity` to the relevant package graph instead of reusing an existing auth helper.
  Evidence: `rg -n "@azure/identity|DefaultAzureCredential|getBearerTokenProvider" packages apps tests docs package.json pnpm-lock.yaml` returned no local matches before implementation.
- Observation: the installed `openai` SDK already carries Azure-specific types and auth support, but the current OpenAssist adapters use the generic `OpenAI` client path rather than `AzureOpenAI`.
  Evidence: `node_modules/.pnpm/openai@5.23.2.../node_modules/openai/azure.d.ts` exposes `azureADTokenProvider`, while `packages/providers-openai/src/index.ts` currently uses `new OpenAI(...)`.
- Observation: Microsoft’s current Azure v1 guidance for the JavaScript OpenAI client passes the Entra token provider through the normal `apiKey` field instead of using a separate Azure-only client constructor.
  Evidence: https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle shows `const client = new OpenAI({ baseURL: ".../openai/v1/", apiKey: tokenProvider })` for JavaScript Entra auth.
- Observation: the existing runtime auth-status path only needed a truthful synthetic `currentAuth.kind = "entra"` branch; Azure did not need linked-account storage, daemon OAuth endpoints, or `openassist auth start/complete`.
  Evidence: targeted CLI and runtime tests passed after adding runtime/CLI status support plus quickstart/wizard Entra handling, without any OAuth-table changes.

## Decision Log

- Decision: add a separate provider route named `azure-foundry` instead of folding Azure into `openai-compatible`.
  Rationale: the setup UX, auth modes, endpoint derivation, status reporting, and operator docs are all different enough that a first-class route is clearer and aligns with the current repo pattern for provider routes.
  Date/Author: 2026-04-02 / Codex
- Decision: support only resource-style Azure endpoints in this PR.
  Rationale: this keeps quickstart simple and matches the chosen scope; project endpoints would force a different config shape and validation path.
  Date/Author: 2026-04-02 / Codex
- Decision: treat Entra as host-credential auth via `DefaultAzureCredential`.
  Rationale: this matches current Microsoft guidance for Azure resource inference and avoids forcing a second linked-account persistence model into the runtime.
  Date/Author: 2026-04-02 / Codex
- Decision: keep `defaultModel` as the deployment name and add optional `underlyingModel` for hints and validation.
  Rationale: runtime already uses `model` as the outgoing model identifier; Azure requires deployment names there, while the underlying model string is only needed for bounded operator guidance.
  Date/Author: 2026-04-02 / Codex
- Decision: keep the Azure route on the generic `OpenAI` JavaScript client and pass the Entra bearer token provider through `apiKey`.
  Rationale: that matches Microsoft’s current v1 JavaScript guidance for Azure resource-style `/openai/v1/` endpoints and keeps the adapter aligned with the existing OpenAssist OpenAI-shared helper path.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective

The Azure Foundry route is now implemented end to end in the repo. Shared provider contracts, runtime auth-status handling, daemon adapter construction, setup quickstart, setup wizard, validation, provider display, docs, and regression coverage have all been updated together. Local repo-wide verification is green on `pnpm verify:all`. The remaining work is the publish-and-fix cycle on the PR.

## Context and Orientation

OpenAssist keeps provider routes explicit across shared contracts, runtime construction, setup UX, and docs. The contract source of truth for provider config lives in `packages/core-types/src/provider.ts`, and schema validation lives in `packages/config/src/schema.ts`. The daemon creates provider adapter instances in `apps/openassistd/src/index.ts`. Interactive operator setup is split across `apps/openassist-cli/src/lib/setup-quickstart.ts`, `apps/openassist-cli/src/lib/setup-wizard.ts`, `apps/openassist-cli/src/lib/setup-validation.ts`, `apps/openassist-cli/src/lib/provider-display.ts`, and `apps/openassist-cli/src/lib/setup-summary.ts`.

The runtime stores API-key auth in memory and linked-account auth in SQLite-backed OAuth tables. Auth-readiness output is surfaced through `packages/core-runtime/src/runtime.ts`, the daemon `/v1/oauth/...` endpoints in `apps/openassistd/src/index.ts`, and CLI rendering in `apps/openassist-cli/src/index.ts` plus `apps/openassist-cli/src/lib/provider-auth-readiness.ts`. This PR must extend that status path for Azure Entra host credentials without pretending that Azure uses the existing linked-account flow.

Provider adapters are separate packages. OpenAI-specific shared request mapping helpers already exist in `packages/providers-openai-shared/src/index.ts`. The existing OpenAI route uses both chat-completions and Responses API, while this Azure route must be Responses-only. The new adapter should reuse the shared Responses mapping helpers rather than duplicating multimodal or tool-call mapping logic.

The required docs sync surfaces are stricter than normal because this is an operator-facing provider-route addition. In addition to the new provider doc under `docs/providers/`, the root `README.md`, root `AGENTS.md`, `docs/README.md`, config docs, operations docs, provider interface docs, and `CHANGELOG.md` must all be updated in the same change.

## Plan of Work

Start by extending the shared provider contracts and schema. Add the `azure-foundry` discriminant and its config fields to `packages/core-types/src/provider.ts` and `packages/config/src/schema.ts`. The config shape must include `authMode`, `resourceName`, `endpointFlavor`, optional `underlyingModel`, optional `reasoningEffort`, and optional `baseUrl`. Then thread the new route through any status or display unions in the CLI and runtime so type narrowing remains exhaustive.

Next, add `packages/providers-azure-foundry`. Its adapter should accept the Azure config shape, derive the default base URL from `resourceName` plus `endpointFlavor` unless `baseUrl` is set, and call the Responses API only. API-key mode should use the provider API key env pattern already used by other API-key routes. Entra mode should use `DefaultAzureCredential` plus `getBearerTokenProvider` from `@azure/identity`, passing the Azure scope required by the official docs. The adapter should reuse the shared helpers from `packages/providers-openai-shared/src/index.ts` for Responses input, tool mapping, image mapping, response folding, and reasoning payloads. It must raise sanitized operator-facing errors for obvious auth failures, invalid endpoint/resource configuration, and model or deployment incompatibility with the Responses API.

Then wire the new adapter into the daemon and runtime-facing status output. `apps/openassistd/src/index.ts` must construct the adapter for `type === "azure-foundry"` and include the package in workspace dependencies and TS project references. `packages/core-runtime/src/runtime.ts` must extend provider auth status so a provider can report `currentAuth.kind = "entra"` with truthful `chatReady` and detail text when runtime is using host credentials rather than an API key or linked account. The CLI status renderers and readiness extraction helpers must understand that additional auth kind.

After the core adapter path is in place, extend the operator setup flows. `setup-quickstart.ts` and `setup-wizard.ts` must expose the new provider route, prompt for Azure-specific fields, and give extra guidance that Azure requires a deployed model and uses deployment name in the outgoing `model` field. Quickstart should offer API key or Entra auth mode, optional service-principal env capture for Entra, bounded reasoning-effort guidance, and resource endpoint flavor selection. `setup-validation.ts` and `setup-summary.ts` must validate and render Azure config truthfully, including missing deployment or resource data, partial Entra service-principal env states, and bounded model-support warnings based on `underlyingModel ?? defaultModel`.

Finally, update tests and docs together. Add adapter tests for request construction and failure handling, expand config/setup/display/auth-status/runtime contract tests, then update all required docs to reflect the new provider route and auth behavior. After the local implementation is complete, run `pnpm verify:all`, fix issues until green, then publish the branch and drive the PR checks to green before handoff.

## Concrete Steps

From `c:\Users\dange\Coding\openassist`, implement the work in this order:

1. Update provider contracts and schema, then run targeted config and type-oriented tests.
2. Add the Azure provider package and daemon wiring, then run targeted provider adapter and runtime contract tests.
3. Update setup quickstart, setup wizard, summaries, and validation, then run the setup and CLI test subsets.
4. Update docs and changelog after behavior is stable.
5. Run `pnpm verify:all`.
6. Publish the feature branch and open a PR.
7. Re-run local verification for any fixes required by CI or review until all checks are green.

Expected command sequence during implementation:

    pnpm test:vitest -- --run tests/vitest/config-security-schema.test.ts tests/vitest/provider-display.test.ts
    pnpm test:vitest -- --run tests/vitest/provider-openai-tool-mapping.test.ts
    pnpm test:node -- tests/node/runtime-provider-tool-contracts.test.ts
    pnpm verify:all

If the targeted commands need adjustment because Vitest or Node test filters differ from the examples above, update this section with the exact working commands that were used.

Working commands used during implementation so far:

    pnpm --filter @openassist/core-types build
    pnpm --filter @openassist/config build
    pnpm --filter @openassist/providers-azure-foundry build
    pnpm --filter @openassist/core-runtime build
    pnpm typecheck
    pnpm vitest run tests/vitest/provider-display.test.ts tests/vitest/setup-quickstart-validation.test.ts tests/vitest/setup-quickstart-flow.test.ts tests/vitest/setup-wizard-runtime.test.ts tests/vitest/provider-azure-foundry.test.ts
    pnpm exec tsx --test tests/node/runtime-provider-tool-contracts.test.ts tests/node/cli-command-branches.test.ts
    pnpm exec tsx --test tests/node/cli-setup-quickstart-runtime.test.ts tests/node/cli-setup-wizard.test.ts tests/node/cli-setup-validation-coverage.test.ts
    pnpm test:coverage:node
    pnpm verify:all

## Validation and Acceptance

Acceptance is met when all of the following are true:

An operator can add an `azure-foundry` provider in quickstart and setup wizard, choosing either API-key or Entra auth, and the saved config validates with the new provider-specific fields. `openassist auth status` shows the route as Azure Foundry and truthfully reports `API key` or `Entra` as the active auth kind without exposing secrets. Provider adapter tests prove that Azure requests go to `/openai/v1/responses`, send deployment name in `model`, include mapped tool schemas and image inputs, and use either a raw API key or Azure token provider depending on `authMode`. Runtime provider-tool contract tests prove that the new route participates in the normal tool loop. All required docs are updated, `CHANGELOG.md` is concrete, and `pnpm verify:all` passes locally. After publication, the PR’s required checks must all be green before handoff.

## Idempotence and Recovery

All file edits are additive or deterministic and can be reapplied safely. If a partial implementation leaves the repo failing tests, use the failing test output to continue from the last completed milestone rather than reverting broad changes. The Azure provider package should be introduced as a separate workspace package so it can be developed and debugged in isolation without destabilizing the existing provider packages. If Entra auth proves difficult to verify in integration tests, keep the runtime contract bounded by mocking token-provider behavior in unit tests rather than introducing live Azure dependencies into CI.

## Artifacts and Notes

Key external implementation facts already validated during planning:

    Microsoft Foundry resource endpoints accept both:
    - https://<resource>.openai.azure.com/openai/v1/
    - https://<resource>.services.ai.azure.com/openai/v1/

    Microsoft guidance for Entra auth with the JavaScript OpenAI client uses:
    - @azure/identity
    - DefaultAzureCredential
    - getBearerTokenProvider(..., "https://ai.azure.com/.default")

    Azure requests must use deployment name in the outgoing model field, not the catalog model ID.

## Interfaces and Dependencies

Add a new provider config interface in `packages/core-types/src/provider.ts`:

    export interface AzureFoundryProviderRuntimeConfig extends CommonProviderConfig {
      type: "azure-foundry";
      authMode: "api-key" | "entra";
      resourceName: string;
      endpointFlavor: "openai-resource" | "foundry-resource";
      underlyingModel?: string;
      reasoningEffort?: OpenAIReasoningEffort;
    }

Extend the `ProviderConfig` union and all related route-label/status unions to include `"azure-foundry"`.

Create `packages/providers-azure-foundry/src/index.ts` exporting:

    export interface AzureFoundryProviderConfig { ... }
    export class AzureFoundryProviderAdapter implements ProviderAdapter { ... }

This adapter must:

- implement `capabilities()` with tools and image inputs enabled
- accept either API-key or Entra auth
- build base URLs from `resourceName` and `endpointFlavor` unless `baseUrl` is provided
- use Responses API only
- reuse `mapResponsesInput`, `mapResponsesTools`, `mapResponsesApiResponse`, `hasImageInputs`, and `reasoningPayload` from `@openassist/providers-openai-shared`

Extend runtime auth-status shape in `packages/core-runtime/src/runtime.ts` and CLI renderers so `currentAuth.kind` can be:

    "none" | "api-key" | "oauth" | "entra"

Update the plan at each milestone with exact commands run, failures found, fixes applied, and the final verification evidence.

Change note: created this ExecPlan after grounding the repo and fixing the Azure route scope and Entra auth assumptions, because the task is non-trivial and AGENTS requires a maintained execution plan under `docs/execplans/`.
