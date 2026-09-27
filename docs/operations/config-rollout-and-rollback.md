# Config Rollout and Rollback

For an isolated developer instance, apply credential changes through its printed setup command and restart its foreground `dev test` process. Its dedicated env file is loaded only at daemon launch; changing it does not affect an already running daemon, the primary service or later build subprocesses.

Application rollback is distinct from configuration/database restoration. Staged lifecycle updates back up stopped state and normalize relative operator paths without resetting provider credentials. Unsupported config/database compatibility versions block activation. Preserve newer state and review queued external actions before any manual database restoration. See [upgrade/recovery](upgrade-and-rollback.md).

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

## Modernization compatibility

Model updates are explicit configuration changes. Back up TOML before replacing a retired Codex model or changing Anthropic thinking controls. Existing conversations, credentials, and SQLite schema are retained. Validate the proposed config before restart; restore the previous config with the matching application checkout if rollback is required.

Anthropic compatibility: the verified `claude-opus-4-5` alias retains manual `thinkingBudgetTokens` exactly like `claude-opus-4-5-20251101`. Quickstart preserves compatible saved thinking settings. If a selected model rejects them (for example, Sonnet 5 with an old manual budget), quickstart asks before resetting to provider defaults. The default answer is No, which returns to model selection so the operator can keep the previous model/settings. Saving remains subject to normal validation; wizard provides the full thinking editor.

For a current-model rollout, back up TOML and explicitly select the model in wizard. Review existing budgets: Opus 5.5/Fable 5.1/Mythos 5.1 reject manual or disabled thinking. Keep provider IDs, credentials and Azure deployment names. Before reverting to a build without these additions, restore the previous model/tuning and remove unsupported `reasoningMode`, `maxOutputTokens` and `workspaceId` fields using the backup. A build without workspace-header support also needs a compatible workspace-scoped key; removing `workspaceId` does not make a multi-workspace key compatible. No database migration is involved.

Before rolling back this refresh, remove the additive Anthropic workspaceId field if using an older build. Such a build cannot route multi-workspace keys; use a compatible workspace-scoped key if needed. Back up config and retain existing encrypted credential/session state. Responses replay metadata needs no database migration; older adapters ignore its additional keys.
