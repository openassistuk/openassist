# Common Troubleshooting

Use this page when install, setup, service, or upgrade behavior feels unclear and you want one place to start.

The quickest repair command is:

```bash
openassist doctor
```

That command uses the same lifecycle model as bootstrap, setup, and upgrade, and it always ends with:

- `Ready now`
- `Needs action`
- `Next command`

If you prefer the beginner lifecycle menu instead of remembering the exact repair command, run:

```bash
openassist setup
```

On a TTY, that opens the lifecycle hub and lets you choose repair, service actions, update planning, or file-location review from one menu.

## `openassist` or `openassistd` is not found

What it usually means:

- the shell has not picked up the wrapper path yet
- you are in a new non-login shell that has not read the PATH snippet bootstrap added

What to run:

```bash
export PATH="$HOME/.local/bin:$PATH"
openassist --help
openassistd --help
```

If that works, start a new shell session and try again. If it does not, use the fallback wrapper path shown by bootstrap:

```bash
$HOME/.local/bin/openassist --help
```

If wrappers are genuinely missing or broken, rerun bootstrap:

```bash
bash scripts/install/bootstrap.sh --install-dir "$HOME/openassist"
```

## Bootstrap finished but did not run onboarding

What it usually means:

- bootstrap stayed non-interactive
- you passed `--non-interactive`
- stdin/stdout were not attached to a TTY

What to run next:

```bash
openassist setup
```

If you want the direct strict first-reply path instead:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

## Bare `openassist setup` says it requires TTY

What it means:

- the lifecycle hub is interactive by design
- non-TTY runs do not mutate anything

Use one of the scriptable paths instead:

```bash
openassist setup quickstart --install-dir "$HOME/openassist" --config "$HOME/.config/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
openassist setup wizard --install-dir "$HOME/openassist" --config "$HOME/.config/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
```

If you already know the config or env file lives somewhere else, keep those explicit paths in the command you run.

## Setup saved, but service or health checks failed

What it usually means:

- the service is not installed yet
- the daemon restarted but health is still failing
- the configured bind URL, channel auth, or provider auth still needs attention

What to run:

```bash
openassist service install --install-dir "$HOME/openassist" --config "$HOME/.config/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
openassist service restart
openassist service health
openassist doctor
```

If you need logs while the service is starting:

```bash
openassist service logs --lines 200 --follow
```

## The bot does not reply in chat

What it usually means:

- provider auth is missing or invalid
- the service is unhealthy
- the channel is not configured for the chat you are testing
- WhatsApp still needs a QR link

What to run:

```bash
openassist service health
openassist channel status
openassist auth status
openassist doctor
```

WhatsApp only:

```bash
openassist channel qr --id whatsapp-main
```

In chat, use:

- `/status` for local diagnostics without depending on provider health
- `/capabilities` for the current provider/channel/tool boundary
- `/grow` for managed skills and helper-tool status

## Full access is not working

What it usually means:

- the install is still in standard mode
- approved operator IDs were not configured for the current channel
- you are testing from a sender ID that is not listed

What to check:

1. In chat, run `/status` and copy the `sender id` and `session id`.
2. Run:

```bash
openassist policy-get --session <channelId>:<conversationKey> --sender-id <sender-id> --json
openassist tools status --session <channelId>:<conversationKey> --sender-id <sender-id>
openassist doctor
```

3. If needed, return to:

```bash
openassist setup wizard
```

and update the channel's approved operator IDs or access mode.

## Legacy repo-local layout migration stopped

What it means:

- OpenAssist found the old default repo-local operator layout
- the target home-state paths were not empty or otherwise safe to merge automatically

What to do:

1. Run:

```bash
openassist doctor
```

2. Look for the `Legacy repo-local operator state` item under `Needs action`.
3. Move or back up the conflicting target files under:

```text
~/.config/openassist/
~/.local/share/openassist/
```

4. Re-run:

```bash
openassist setup
```

Automatic migration only handles the recognized old default layout:

- `<installDir>/openassist.toml`
- `<installDir>/config.d`
- `<installDir>/.openassist`

If your old layout used custom paths, keep using explicit `--config` and `--env-file` values or migrate it manually.

## `openassist upgrade --dry-run` says to fix something before updating

What it usually means:

- the checkout has real local code changes
- the install is damaged or no longer repo-backed
- the install still needs legacy-layout migration first
- required build output or helper binaries are missing

Start with:

```bash
openassist doctor
openassist upgrade --dry-run --install-dir "$HOME/openassist"
```

Interpret the result like this:

- `safe to continue`: run `openassist upgrade`
- `fix before updating`: resolve the reported blockers, then rerun dry-run
- `rerun bootstrap instead`: treat the install as damaged or incomplete and reinstall/repair via bootstrap

If the repo has local code changes and you want to keep them, commit or stash them first. If the checkout is no longer trustworthy, use bootstrap instead of forcing upgrade.

## You are unsure which files OpenAssist is using

Run:

```bash
openassist doctor
```

and:

```bash
openassist setup
```

Then choose `Show file locations and lifecycle status`.

Fresh installs now use the home-state layout by default:

- config: `~/.config/openassist/openassist.toml`
- overlays: `~/.config/openassist/config.d`
- env file: `~/.config/openassist/openassistd.env`
- install state: `~/.config/openassist/install-state.json`
- runtime data: `~/.local/share/openassist/data`
- runtime logs: `~/.local/share/openassist/logs`
- managed skills: `~/.local/share/openassist/skills`
- managed helper tools: `~/.local/share/openassist/data/helper-tools`

The repo-root `openassist.toml` file is a source-development sample, not the default installed config path.
