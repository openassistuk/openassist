# Install on Linux

This runbook is the primary operator installation path.
For the fastest path (including end-user first-reply checks), use `docs/operations/quickstart-linux-macos.md`.

## Prerequisites

- `bash`
- `systemd` (user or system mode is selected automatically)

Bootstrap checks for `git`, `node >= 22`, and `pnpm >= 10` automatically and attempts to install missing prerequisites by default.

Notes:

- automatic package installation may require `sudo` privileges
- Debian/Ubuntu Node 22 provisioning uses NodeSource during bootstrap
- if NodeSource still leaves Node below minimum, bootstrap attempts fallback install via `npm+n` (`n 22`)
- pass `--no-auto-install-prereqs` to disable automatic installation
- when prereq auto-install fails, bootstrap now prints manual remediation commands and (interactive mode) offers retry before exit
- when GitHub HTTPS auth fails (for example stale/wrong cached credentials), bootstrap now offers interactive recovery (`retry`, `clear cached GitHub HTTPS credentials and retry`, `abort`) instead of hard-exiting immediately
- workspace `onlyBuiltDependencies` allowlist (`esbuild`, `protobufjs`) is preconfigured to avoid interactive `pnpm approve-builds` during bootstrap install
- service manager mode is automatic:
  - non-root shell -> `systemd --user`
  - root shell -> system-level `systemd`

## Install from GitHub (Direct)

Interactive installer from GitHub:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh)"
```

Non-interactive automation example:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --non-interactive --skip-service
```

## Bootstrap Install (Repo Checkout)

Adaptive default:

- interactive when stdin/stdout are TTY
- non-interactive in automation/non-TTY environments

```bash
bash scripts/install/bootstrap.sh
```

Guided onboarding during bootstrap:

```bash
bash scripts/install/bootstrap.sh --interactive
```

Common options:

```bash
bash scripts/install/bootstrap.sh --install-dir "$HOME/openassist" --ref main
bash scripts/install/bootstrap.sh --interactive --allow-incomplete
bash scripts/install/bootstrap.sh --interactive --skip-service
bash scripts/install/bootstrap.sh --non-interactive --skip-service
bash scripts/install/bootstrap.sh --non-interactive --no-auto-install-prereqs
```

If prerequisite installation fails, bootstrap now provides troubleshooting commands and asks whether to retry automatic installation (interactive mode).

If service status shows `status=226/NAMESPACE` with a mount namespace error referencing `~/.local/state/openassist`, run:

```bash
mkdir -p "$HOME/.local/state/openassist"
openassist service restart
openassist service status
```

If service status shows `Result: core-dump` with `signal=TRAP` right after startup, your unit likely still has older hardening (`MemoryDenyWriteExecute=true`) that can break Node/V8 on some hosts. Pull latest OpenAssist, rebuild, then reinstall service:

```bash
cd "$HOME/openassist"
git pull
pnpm install --frozen-lockfile
pnpm -r build
openassist service install --config "$HOME/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
openassist service restart
openassist service status
```

Bootstrap outputs:

- install directory (`$HOME/openassist` by default)
- config path (`<installDir>/openassist.toml`)
- env secrets file (`~/.config/openassist/openassistd.env`)
- install-state file (`~/.config/openassist/install-state.json`)
- CLI wrappers (`~/.local/bin/openassist`, `~/.local/bin/openassistd`)
- when writable, global links (`/usr/local/bin/openassist`, `/usr/local/bin/openassistd`)

## Verify CLI Wrappers

```bash
openassist --help
openassistd --help
```

Bootstrap writes PATH profile snippets automatically. If this shell was already open, start a new shell or run:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Immediate no-PATH fallback:

```bash
$HOME/.local/bin/openassist --help
$HOME/.local/bin/openassistd --help
```

## Strict Onboarding (if bootstrap was non-interactive)

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Advanced editor alternative:

```bash
openassist setup wizard --config "$HOME/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
```

Wizard saves now trigger service restart + health/time/scheduler checks by default. Use `--skip-post-checks` to save without running operational checks. If checks fail, wizard now offers retry/skip/abort recovery actions.

Quickstart service checks also include recovery prompts:

- strict mode: retry or abort
- `--allow-incomplete`: retry, skip, or abort
- health probes automatically fall back to loopback when bind address is wildcard (`0.0.0.0` / `::`)
- quickstart/wizard prompt inputs are validated and re-prompted for invalid numeric/identifier/bind-address values, and timezone is selected via guided `country/region -> city` picker
- provider setup includes explicit OAuth account-link guidance for OpenAI/Anthropic when OAuth client config is present
- quickstart captures assistant profile defaults (name/persona/preferences) for global main-agent memory; per-session host bootstrap context is still persisted separately

Secret handling defaults:

- `security.secretsBackend` is `encrypted-file` only
- channel secret-like settings must use `env:VAR_NAME` references
- provider OAuth `clientSecretEnv` must be a valid env-var name
- setup/runtime enforce owner-only Unix permissions for secret-bearing env/key paths

## Timezone and Scheduler Verification

```bash
openassist time status
openassist scheduler status
openassist scheduler tasks
openassist tools status --session <channel>:<conversationKey>
```

## Service Lifecycle

Install/start service:

```bash
openassist service install --install-dir "$HOME/openassist" --config "$HOME/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
openassist service status
```

Operational commands:

```bash
openassist service restart
openassist service logs --lines 200 --follow
openassist service health
openassist service enable
openassist service disable
openassist service uninstall
```

If daemon health is OK but a bot/channel is not responding, check connector health separately:

```bash
openassist channel status
```

Channel startup is non-blocking by design, so degraded connectors do not block daemon `/v1/health`.

## Upgrade Path

```bash
openassist upgrade --dry-run
openassist upgrade --ref main
```

Upgrade includes auto rollback on restart/health failure.

## Source Checkout Alternative (Contributor Mode)

```bash
pnpm install
pnpm -r build
pnpm --filter @openassist/openassistd dev -- run --config openassist.toml
pnpm --filter @openassist/openassist-cli dev -- setup quickstart --config openassist.toml --env-file ~/.config/openassist/openassistd.env --skip-service
```
