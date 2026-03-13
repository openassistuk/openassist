# OpenClaw Import

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
- unsupported fields are intentionally reported as warnings, not silently dropped
