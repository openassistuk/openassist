# Install on macOS

This runbook covers supported macOS operation using LaunchAgents.
For the fastest path (including end-user first-reply checks), use `docs/operations/quickstart-linux-macos.md`.

## Prerequisites

- `bash`
- `launchctl`

Bootstrap checks for `git`, `node >= 22`, and `pnpm >= 10` automatically and attempts to install missing prerequisites by default.

Notes:

- automatic prerequisite installation on macOS uses Homebrew
- if Homebrew is missing, install it first (`https://brew.sh`)
- pass `--no-auto-install-prereqs` to disable automatic installation
- when prereq auto-install fails, bootstrap prints manual remediation commands and (interactive mode) offers retry before exit
- when GitHub HTTPS auth fails (for example stale/wrong cached credentials), bootstrap offers interactive recovery (`retry`, `clear cached GitHub HTTPS credentials and retry`, `abort`) instead of hard-exiting immediately
- workspace `onlyBuiltDependencies` allowlist (`esbuild`, `protobufjs`) is preconfigured to avoid interactive `pnpm approve-builds` during bootstrap install

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

If prerequisite installation fails, bootstrap now prints actionable troubleshooting commands and offers interactive retry/manual-fix selection.

Bootstrap creates:

- install directory (`$HOME/openassist` by default)
- config file (`<installDir>/openassist.toml`)
- env secrets file (`~/.config/openassist/openassistd.env`)
- install-state (`~/.config/openassist/install-state.json`)
- wrappers (`~/.local/bin/openassist`, `~/.local/bin/openassistd`)

## Verify Wrappers

```bash
openassist --help
openassistd --help
```

Bootstrap writes PATH profile snippets automatically. If commands are not visible in the current shell, open a new terminal or run:

```bash
export PATH="$HOME/.local/bin:$PATH"
$HOME/.local/bin/openassist --help
$HOME/.local/bin/openassistd --help
```

## Setup and Validation

Recommended strict onboarding:

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

Wizard saves now run service restart + health/time/scheduler checks by default. Use `--skip-post-checks` to save only. If checks fail, wizard now offers retry/skip/abort recovery actions.

Quickstart service checks also include recovery prompts:

- strict mode: retry or abort
- `--allow-incomplete`: retry, skip, or abort
- health probes automatically fall back to loopback when bind address is wildcard (`0.0.0.0` / `::`)
- quickstart/wizard prompt inputs are validated and re-prompted for invalid numeric/identifier/bind-address values, and timezone is selected via guided `country/region -> city` picker
- provider setup includes explicit OAuth account-link guidance for OpenAI/Anthropic when OAuth client config is present
- quickstart captures assistant profile defaults (name/persona/preferences) for global main-agent memory; per-session host bootstrap context is still persisted separately
- quickstart and wizard also configure native web tooling (`tools.web.enabled`, `tools.web.searchMode`)
- `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY` is the primary API-backed search credential; `hybrid` mode falls back to DuckDuckGo HTML when the key is absent
- `api-only` mode is rejected during setup validation if `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY` is missing

Secret handling defaults:

- `security.secretsBackend` is `encrypted-file` only
- channel secret-like settings must use `env:VAR_NAME` references
- provider OAuth `clientSecretEnv` must be a valid env-var name
- setup/runtime enforce owner-only Unix permissions for secret-bearing env/key paths

Time/scheduler checks:

```bash
openassist time status
openassist scheduler status
openassist tools status --session <channel>:<conversationKey>
```

`openassist tools status` now reports callable tools, configured tool families, awareness summary, and native web backend state for the selected session.

## launchd Service Lifecycle

```bash
openassist service install --install-dir "$HOME/openassist" --config "$HOME/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
openassist service status
openassist service restart
openassist service logs --lines 200 --follow
openassist service health
```

If daemon health is OK but a bot/channel is not responding, inspect connector health separately:

```bash
openassist channel status
```

Channel startup is non-blocking by design, so degraded connectors do not block daemon `/v1/health`.

Enable/disable/uninstall:

```bash
openassist service enable
openassist service disable
openassist service uninstall
```

## Upgrade Path

```bash
openassist upgrade --dry-run
openassist upgrade --ref main
```

## Source Checkout Alternative

```bash
pnpm install
pnpm -r build
pnpm --filter @openassist/openassistd dev -- run --config openassist.toml
pnpm --filter @openassist/openassist-cli dev -- setup quickstart --config openassist.toml --env-file ~/.config/openassist/openassistd.env --skip-service
```

Linux remains the primary release target; macOS is a supported operational path with smaller validation depth.
