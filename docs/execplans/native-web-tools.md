# Native Web Search, Fetch, and Research Tools

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.agents/PLANS.md`. This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, OpenAssist has first-class native web tooling owned by the runtime instead of relying on the model to pretend it can browse. In `full-root` sessions, the model can call `web.search`, `web.fetch`, and `web.run` through the same audited tool loop as host tools. The runtime uses a bounded HTTP-only implementation: Brave Search API is the primary search backend when `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY` is configured, and DuckDuckGo HTML fallback keeps the feature usable in `hybrid` mode when the Brave key is absent.

This is observable from setup, runtime status, and tool execution. `setup quickstart` and `setup wizard` now configure `tools.web.*` and can capture the Brave API key in the env file. `openassist tools status` reports native web backend mode and availability. In a `full-root` chat session, tool invocations now show `web.search`, `web.fetch`, and `web.run` with backend and final-URL metadata.

## Progress

- [x] (2026-03-06 12:25Z) Added `RuntimeWebToolsConfig` and `tools.web` schema/defaults in `packages/core-types/src/runtime.ts`, `packages/config/src/schema.ts`, `packages/config/src/loader.ts`, and `openassist.toml`.
- [x] (2026-03-06 12:45Z) Created the new package `packages/tools-web` with bounded implementations for `web.search`, `web.fetch`, `web.run`, and status helpers.
- [x] (2026-03-06 13:00Z) Wired `WebTool` into `packages/core-runtime/src/runtime.ts`, `packages/core-runtime/src/tool-registry.ts`, and `packages/core-runtime/src/tool-router.ts`.
- [x] (2026-03-06 13:10Z) Extended policy actions and gating so `web.*` is authorized only in `full-root`.
- [x] (2026-03-06 13:25Z) Added setup/validation/env-file support for `tools.web.searchMode` and `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY` in quickstart and wizard flows.
- [x] (2026-03-06 13:35Z) Added unit and integration coverage for web-tool parsing, backend selection, fallback behavior, redirect handling, fetch extraction, tool routing, and runtime awareness reporting.
- [x] (2026-03-06 14:00Z) Updated README, interfaces, operations, security docs, testing docs, and changelog so the new native web surface is documented as operator-facing behavior.

## Surprises & Discoveries

- Observation: The repository did not need a browser automation stack to satisfy the first release of native browsing.
  Evidence: `packages/tools-web/src/index.ts` uses `fetch`, redirect handling, and deterministic HTML/text extraction to support `web.search`, `web.fetch`, and `web.run` without introducing Playwright or headless-browser dependencies.
- Observation: Hybrid mode needed to remain useful even when the Brave API key is not present, but `api-only` needed to fail early during setup rather than surprising operators later.
  Evidence: `apps/openassist-cli/src/lib/setup-validation.ts` now blocks `tools.web.searchMode="api-only"` when `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY` is missing and emits a warning for `hybrid` without the key.
- Observation: Search backend state had to flow into awareness and status surfaces, otherwise operators would see only “tool enabled” rather than whether current web search would succeed.
  Evidence: `packages/core-runtime/src/runtime.ts` exposes `webTool` status and awareness summary through `getToolsStatus()` and `/status`.

## Decision Log

- Decision: Ship native web tools as a new package, `packages/tools-web`, instead of embedding the implementation inside `packages/core-runtime`.
  Rationale: The repository already separates host tool families into dedicated packages. A separate web-tools package keeps module boundaries clean and makes testing/parsing logic easier to own.
  Date/Author: 2026-03-06 / Codex

- Decision: Use HTTP-first extraction only in this release.
  Rationale: The user request explicitly allowed an HTTP-first implementation, and it meets the core need without opening a browser execution surface or dragging in a much larger dependency and security footprint.
  Date/Author: 2026-03-06 / Codex

- Decision: Default `tools.web.enabled=true` and `tools.web.searchMode="hybrid"`.
  Rationale: The goal was for native browsing to be “one of its most important tools” and available immediately, but still safe. Hybrid mode gives immediate value even when the Brave key is not set, while policy gating still keeps schemas hidden outside `full-root`.
  Date/Author: 2026-03-06 / Codex

- Decision: Return structured unavailable results instead of throwing hard failures when no search backend is usable.
  Rationale: Operators need actionable guidance, and the model should be able to report the precise unavailability reason rather than receiving a silent or generic failure.
  Date/Author: 2026-03-06 / Codex

## Outcomes & Retrospective

The native web tooling work achieved the intended outcome. OpenAssist now has runtime-owned `web.search`, `web.fetch`, and `web.run` tools, exposed through the normal tool registry/router/audit path and gated to `full-root`. Setup now treats web tooling as a first-class operator choice, and runtime status exposes whether search is available, fallback-backed, unavailable, or disabled.

The main tradeoff was choosing HTTP-only extraction for this release. That keeps the surface safer and simpler, but it means sites that require heavy client-side JavaScript will not render. That limitation is explicit in runtime awareness and documentation, which leaves room for a later browser-rendering follow-up without confusing current operators.

## Context and Orientation

Runtime config contracts live in `packages/core-types/src/runtime.ts` and schema/default loading lives in `packages/config/src/schema.ts` and `packages/config/src/loader.ts`. The runtime tool registry is `packages/core-runtime/src/tool-registry.ts` and runtime dispatch lives in `packages/core-runtime/src/tool-router.ts`. Policy gating lives in `packages/core-runtime/src/policy-engine.ts`. CLI setup flows live in `apps/openassist-cli/src/lib/setup-quickstart.ts`, `apps/openassist-cli/src/lib/setup-wizard.ts`, `apps/openassist-cli/src/lib/setup-validation.ts`, and `apps/openassist-cli/src/lib/env-file.ts`.

In this repository, “native web tools” means runtime-owned tools executed by the daemon itself, not the model using its own built-in browsing. `web.search` returns structured results from a configured backend. `web.fetch` retrieves a single `http` or `https` page and extracts bounded text plus citations. `web.run` orchestrates a bounded research pass by combining search and fetch. All three are still subject to policy authorization and tool-invocation audit logging.

## Plan of Work

The work proceeds in five parts. First, define `tools.web` in runtime contracts and config defaults. Second, implement the web-tool package with deterministic extraction, backend selection, and status reporting. Third, wire the new tool family into the runtime schema registry, tool router, and awareness/status output. Fourth, extend setup quickstart and setup wizard so operators can configure native web tooling and provide the Brave API key. Fifth, add tests and docs to prove the new behavior.

The core implementation is in `packages/tools-web/src/index.ts`. `WebTool.getStatus()` reports availability and limits. `search()` uses Brave API when allowed and configured, then falls back to DuckDuckGo HTML in hybrid mode. `fetchUrl()` enforces `http`/`https`, manual redirect following, byte caps, and deterministic HTML/text extraction. `run()` orchestrates bounded search-then-fetch behavior and returns cited source material. The runtime integrates this through `runtimeToolSchemas()`, `RuntimeToolRouter`, and `OpenAssistRuntime.rebuildRuntimeTools()`.

## Concrete Steps

Run the following from the repository root `c:\Users\dange\Coding\openassist`.

1. Build the workspace.

       pnpm -r build

2. Run the web-tool unit tests and the broader test suites.

       pnpm vitest run tests/vitest/web-tool.test.ts
       pnpm test:vitest
       pnpm test:node

   Expect the web-tool tests to cover backend selection, fallback behavior, redirect handling, and HTML extraction.

3. Validate setup behavior manually in a TTY environment.

       openassist setup quickstart --config openassist.toml --env-file ~/.config/openassist/openassistd.env --skip-service

   Expect prompts for native web enablement and search mode. If `api-only` is selected without `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY`, validation must block.

4. Validate runtime status for a representative session.

       openassist tools status --session telegram:ops-room

   Expect native web status fields showing `searchMode`, backend availability, and awareness summary.

## Validation and Acceptance

Acceptance is satisfied when all of the following are true:

1. `tools.web` validates and loads through schema/default paths with `enabled=true` and `searchMode="hybrid"` by default.
2. `web.search`, `web.fetch`, and `web.run` appear in the runtime tool schema list only for `full-root` sessions.
3. In `hybrid` mode without a Brave key, `web.search` returns DuckDuckGo HTML fallback results instead of failing silently.
4. In `api-only` mode without a Brave key, setup validation blocks the configuration and runtime returns structured unavailable guidance if reached.
5. `web.fetch` rejects non-HTTP schemes, follows redirects within the configured cap, enforces byte limits, and returns citations/final URLs.
6. Tool invocations for `web.*` are auditable through the same runtime path as other tools.

The concrete commands executed for this implementation were:

    pnpm -r build
    pnpm vitest run tests/vitest/web-tool.test.ts tests/vitest/tool-loop-runtime.test.ts tests/vitest/runtime-config-tools-wiring.test.ts tests/vitest/config-security-schema.test.ts tests/vitest/setup-quickstart-validation.test.ts tests/vitest/setup-quickstart-flow.test.ts tests/vitest/setup-wizard-runtime.test.ts tests/vitest/setup-wizard-branches.test.ts
    pnpm test:vitest
    pnpm test:node

All passed on 2026-03-06 in this working tree.

## Idempotence and Recovery

The implementation is additive. Re-running setup rewrites the same `tools.web.*` config and env-file settings instead of creating duplicate state. `WebTool` reads live environment/config on runtime rebuild, so changing `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY` or `tools.web.searchMode` takes effect through the normal config apply/restart path. If a backend is unavailable, the runtime returns structured guidance instead of leaving the session in an unknown state.

## Artifacts and Notes

Important evidence from the completed work:

    packages/tools-web/src/index.ts
      - WebTool.search()
      - WebTool.fetchUrl()
      - WebTool.run()
      - WebTool.getStatus()

    tests/vitest/web-tool.test.ts
      - HTML extraction
      - Brave preference with configured key
      - DuckDuckGo fallback
      - redirect-following fetch
      - structured unavailable results

    apps/openassist-cli/src/lib/setup-validation.ts
      - validateWebToolRequirements()

    packages/core-runtime/src/tool-registry.ts
      - web.search
      - web.fetch
      - web.run

## Interfaces and Dependencies

At completion, the following interfaces and modules must exist and are now present:

- `packages/core-types/src/runtime.ts`
  - `RuntimeWebToolsConfig`
- `packages/core-types/src/policy.ts`
  - `web.search`, `web.fetch`, `web.run` tool actions
- `packages/tools-web/src/index.ts`
  - `WebTool`
  - `OPENASSIST_WEB_BRAVE_API_KEY_ENV`
  - helper exports used in tests (`extractHtmlText`, `unwrapDuckDuckGoHref`, `normalizeWhitespace`, `decodeHtmlEntities`)
- `packages/core-runtime/src/tool-registry.ts`
  - runtime schemas for `web.search`, `web.fetch`, `web.run`
- `packages/core-runtime/src/tool-router.ts`
  - routing for `web.*` tool calls
- `apps/openassist-cli/src/lib/setup-quickstart.ts` and `apps/openassist-cli/src/lib/setup-wizard.ts`
  - interactive editing for native web enablement and search mode

Revision note (2026-03-06): Initial checked-in completed ExecPlan capturing the shipped native web tooling implementation, operator setup path, decisions, and validation evidence so future contributors can extend the feature without reconstructing context from the commit diff.
