# OpenClaw Import

Imported configuration and conversations remain operator state independent of packaged/source applications. Use explicit lifecycle migration to switch installation method; do not copy imported credentials into isolated developer instances automatically. See [upgrade/recovery](../operations/upgrade-and-rollback.md).

Implementation: `packages/migration-openclaw/src/index.ts`.

## Command

Installed command path:

```bash
openassist migrate openclaw --input <openclaw-root> --output <openassist.toml>
```

Source checkout alternative:

```bash
pnpm --filter @openassist/openassist-cli dev -- migrate openclaw --input <openclaw-root> --output openassist.toml
```

## Input Requirements

Required source file:

- `<openclaw-root>/openclaw.json`

## Mapping Rules

### Provider mapping

- names containing `anthropic` or `claude` map to type `anthropic`
- names containing `codex` map to type `codex`
- names containing `openai` map to type `openai`
- all other provider names map to type `openai-compatible`

Azure Foundry note:

- the current importer does not auto-convert Azure/OpenAI-compatible entries into `azure-foundry`
- if you want the Azure resource-style `/openai/v1/` route, change the imported provider manually after import or rerun setup wizard and create a fresh `azure-foundry` provider

Mapped fields: `id`, `type`, `defaultModel`, optional `baseUrl`.

Codex mapping note:

- imported Codex providers should keep Codex-family models on the new `codex` route
- the importer does not silently convert arbitrary OpenAI account-login assumptions into a generic `openai` API-key route
- imported Codex providers still require a fresh linked-account login in OpenAssist
- device code is the recommended Codex login path on VPS or remote hosts, with browser callback/manual paste still supported as fallback
- new Codex login starts now use the standard localhost callback `http://localhost:1455/auth/callback`
- on headless hosts that login can still be completed from the printed authorization URL by copying the full callback URL from the browser address bar and pasting it back into OpenAssist
- the additive manual completion command is `openassist auth complete --provider <provider-id> --callback-url "<full callback URL>" --base-url http://127.0.0.1:3344`
- imported or newly created Codex providers only count as linked when OpenAssist has a chat-ready Codex/ChatGPT token auth handle; a stored but unusable linked-account row is not treated as success
- Once imported Codex auth is linked and chat-ready, reachable lifecycle validation and `openassist doctor` should stop surfacing the pending default-Codex account-link warning.
- Once linked, Codex chat requests preserve the upstream conversation contract by sending the runtime session id, account header, top-level instructions payload, and the upstream-aligned `/responses` fields Codex currently requires, including `store=false`, `stream=true`, and a prompt-cache key derived from the runtime session id; OpenAssist then folds the upstream event stream back into its normal reply contract before channel delivery.
- linked Codex auth is stored as encrypted OAuth state in SQLite, and OpenAssist attempts automatic refresh before expiry and again on auth-style provider failures when a refresh token is available

### Channel mapping

- names containing `telegram` map to `telegram`
- names containing `discord` map to `discord`
- names containing `whatsapp` map to `whatsapp-md`
- unsupported channel types are skipped with warnings

Primitive channel settings (`string`, `number`, `boolean`) are copied when possible.

### Runtime defaults added by importer

Importer emits valid current-schema defaults for:

- `runtime.time.*`
- `runtime.scheduler.*` (empty task list)

## Output Behavior

Importer:

- writes resulting OpenAssist TOML
- prints source files used
- prints warnings for skipped or unmapped fields

## Known Limits

- config migration only (no live token/session material import)
- OAuth linked-account state is not imported
- Azure Foundry provider entries are not auto-detected as a separate route by the current importer
- unsupported fields are intentionally reported as warnings, not silently dropped

## Modernization compatibility

Imported model IDs remain unchanged; only absent-model defaults now use `gpt-6.1-sol` (or `claude-opus-5-5` for Anthropic). Imports do not inject xhigh effort. A generic provider without a model gets a visible your-model-name placeholder and warning; explicitly enter the ID served by that backend before use. Review imported providers in setup wizard, then run doctor. Known retired Codex IDs block readiness until explicitly replaced. Sonnet 5/Sonnet 5.5/Opus 5 and Opus 5.5/Fable 5.1/Mythos 5.1 reject manual Anthropic budgets. OpenAssist supports Sonnet 5.5 with adaptive thinking only; Opus 5.5/Fable/Mythos require adaptive thinking. Configure tuning through wizard using the [route-specific model matrix](../providers/model-compatibility.md); provider labels and model-like deployment names do not establish capabilities.

After importing an Anthropic multi-workspace key, explicitly set workspaceId in OpenAssist setup/TOML; importing a credential does not infer its workspace. Existing workspace-scoped keys remain compatible. Provider replay uses additive local metadata and needs no database migration.

Imported model IDs and compatible manual settings remain intact. The full catalog recognizes verified OpenAI aliases/API pins and active Claude generations, with route-specific retirement metadata. An imported retired ID can pass schema parsing but blocks readiness and provider requests until explicitly changed in wizard. Deprecated selections warn with their announced date. Import does not assume vendor capability or lifecycle dates for an Azure deployment name or generic served ID. See the [model matrix](../providers/model-compatibility.md).
