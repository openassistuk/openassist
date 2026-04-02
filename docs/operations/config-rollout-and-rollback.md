# Config Rollout and Rollback

OpenAssist uses layered TOML config with schema validation and generation tracking for safe apply behavior.

If the config change leaves the install in a confusing lifecycle state, fall back to `docs/operations/common-troubleshooting.md` for the repair commands that match the current hub/doctor/upgrade flow.

## Config Sources

Load order:

1. base file (default: `~/.config/openassist/openassist.toml`)
2. overlays (default: `~/.config/openassist/config.d/*.toml`, lexicographic)

Relevant implementation:

- loader: `packages/config/src/loader.ts`
- schema: `packages/config/src/schema.ts`

Fresh installs now keep writable operator config outside the repo checkout by default. The repo-root `openassist.toml` file is a source-development sample, not the installed default path.

## Validation Commands

Installed command path:

```bash
openassist config validate --config ~/.config/openassist/openassist.toml
```

Interactive paths:

```bash
openassist setup
openassist setup quickstart --config ~/.config/openassist/openassist.toml --env-file ~/.config/openassist/openassistd.env --skip-service
openassist setup wizard --config ~/.config/openassist/openassist.toml --env-file ~/.config/openassist/openassistd.env
```

Use bare `setup` for the beginner-facing lifecycle hub, `setup quickstart` for strict validation-driven onboarding, and `setup wizard` for targeted advanced section edits.

If a setup flow detects the recognized old repo-local layout (`openassist.toml`, `config.d`, and `.openassist` inside the install directory), it will migrate that state into the canonical home-state layout when the target home paths are empty or compatible. Migration writes a timestamped backup bundle under `~/.local/share/openassist/migration-backups/` before it changes anything. `openassist doctor` and `openassist upgrade --dry-run` detect the same legacy layout and route you back to setup instead of migrating it in place.

## Time and Scheduler Keys

`[runtime.time]` controls:

- timezone default and confirmation requirement
- NTP policy and check cadence
- skew thresholds and HTTP date sources

`[runtime.scheduler]` controls:

- worker enable/disable
- tick and heartbeat intervals
- default misfire policy
- task list (`[[runtime.scheduler.tasks]]`)

Task schema constraints:

- `cron` required when `scheduleKind="cron"`
- `intervalSec` required when `scheduleKind="interval"`

`[tools]` controls chat autonomy runtime behavior:

- `[tools.fs]` path policy boundaries
- `[tools.exec]` default timeout and guardrails
- `[tools.pkg]` package manager install behavior

`[security]` currently controls:

- `auditLogEnabled`
- `secretsBackend` (`encrypted-file` only)

## Secret and Env Strategy

- provider keys are environment variables (`OPENASSIST_PROVIDER_<ID>_API_KEY`)
- channel secrets can be `env:VAR_NAME` indirections
- Azure Foundry Entra service-principal auth may also use global `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET`
- plaintext secret-like channel settings (`token`, `secret`, `apiKey`, `password`, etc.) are rejected
- provider OAuth `clientSecretEnv` must be a valid env-var name (`[A-Za-z_][A-Za-z0-9_]*`)

## Apply and Rollback Model

Runtime tracks config generations:

1. create candidate generation
2. validate module configuration
3. activate on success
4. mark rollback on failure

Invalid candidates do not replace active generation.

## Rollout Checklist

1. edit config
2. run `openassist config validate`
3. apply by restart or runtime config apply path
4. verify:
   - `/v1/health`
   - `/v1/time/status`
   - `/v1/scheduler/status`
   - channel status
5. monitor logs through warmup window

## SQL Introspection

```sql
SELECT generation, status, created_at, activated_at, rolled_back_at
FROM config_generations
ORDER BY generation DESC
LIMIT 5;
```
