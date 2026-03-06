# Setup Quickstart and Setup Wizard

OpenAssist has two setup paths on purpose.

- `openassist setup quickstart`: minimal first-reply onboarding
- `openassist setup wizard`: advanced section editor

They are not interchangeable.

## Quickstart

Run quickstart when the goal is to get from install to a real reply with the least possible operator decision load.

Command:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart owns only the essentials:

- confirm safe runtime defaults
- choose one primary provider
- capture API-key auth
- configure one primary channel
- confirm timezone
- run service install, restart, and health checks unless `--skip-service`

Quickstart success should leave you with:

- one provider configured
- one channel configured
- a healthy service, unless you explicitly skipped checks
- a first-reply checklist in the summary

Quickstart rules:

- strict validation blocks incomplete first-reply setup by default
- `--allow-incomplete` adds an explicit degraded-save path
- recovery flows remain retry-first; skip is available only when the flow allows degraded continuation
- guided timezone selection stays `country or region -> city`
- timezone confirmation shows the selected zone and uses a simple `Y/n` confirmation
- wildcard bind addresses still use loopback health probes
- quickstart keeps provider auth API-key-first
- provider OAuth client configuration belongs in wizard, then account linking uses `openassist auth start --provider <provider-id> --account default --open-browser`

Quickstart intentionally does not own:

- extra providers
- extra channels
- scheduler task authoring
- native web tuning
- advanced tools and security changes
- persona or profile editing

## Wizard

Run wizard when you need to edit configuration beyond first-reply essentials.

Command:

```bash
openassist setup wizard \
  --config "$HOME/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env" \
  --install-dir "$HOME/openassist"
```

Wizard sections:

- basic runtime and defaults
- providers and model access
- channels and chat destinations
- scheduling and time
- advanced tools and security

Use wizard for:

- advanced runtime changes
- additional providers or provider OAuth config
- additional channels or non-default channel behavior
- scheduler task and timing changes
- native web settings
- advanced tools, workspace, and security posture

Wizard is safe to re-run after install, after a successful quickstart, and after upgrades when you need to edit advanced settings instead of redoing first-run onboarding.

## Post-Save Behavior

Wizard saves are operational by default, not just config writes.

After a save, wizard:

1. writes the config and env file
2. creates a backup when the config already exists
3. restarts the service
4. checks daemon health
5. checks time status
6. checks scheduler status

If checks fail, wizard offers:

- retry
- skip
- abort

Use `--skip-post-checks` only when you intentionally want to save without operational validation.

If you skip or abort post-save checks, follow up with:

```bash
openassist service restart
openassist service health
openassist doctor
```

## Secret Handling

Setup flows keep secret values in the env file and keep config references as `env:VAR_NAME`.

Examples:

```toml
botToken = "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN"
```

```toml
clientSecretEnv = "OPENASSIST_OPENAI_OAUTH_CLIENT_SECRET"
```

Important rules:

- plaintext secret-like channel settings are rejected
- provider OAuth `clientSecretEnv` must be a valid env-var name
- Unix secret-bearing files are kept owner-only where the host supports it

## Related Commands

Show effective config:

```bash
openassist setup show --config "$HOME/openassist/openassist.toml"
```

Edit env values interactively:

```bash
openassist setup env --env-file "$HOME/.config/openassist/openassistd.env"
```

Validate lifecycle readiness after setup:

```bash
openassist doctor
openassist service health
```
