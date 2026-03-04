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
- names containing `openai` map to type `openai`
- all other provider names map to type `openai-compatible`

Mapped fields: `id`, `type`, `defaultModel`, optional `baseUrl`.

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
