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
- Codex was selected as the default provider but its account login was not completed yet
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

## Codex provider is configured but account login is not complete

What it usually means:

- quickstart or wizard saved a `codex` provider entry
- the linked OpenAI account was skipped or expired
- the provider route is correct, but the account-login step is not finished

What to run:

```bash
openassist auth start --provider codex-main --device-code
openassist auth status
openassist doctor
```

If you used a different provider ID, substitute that instead of `codex-main`.

On a VPS or other remote host, `--device-code` is the recommended Codex login path. `--open-browser` remains available as the fallback browser/manual path, and missing local browser launchers are no longer treated as fatal errors.

The normal Codex browser redirect is now:

```text
http://localhost:1455/auth/callback
```

On a VPS or other remote host, that localhost page may not load in the browser you used for approval. That is still fine: copy the full URL from the browser address bar and paste it back into quickstart, or complete the flow manually:

```bash
openassist auth complete --provider codex-main --callback-url "<full callback URL>" --base-url http://127.0.0.1:3344
```

Important:

- `codex` is the separate OpenAI account-login route
- `openai` remains the API-key route
- new account-login installs should use `codex`, not a new mixed `openai + oauth` provider

If you are scripting the completion step and already have the values split out, the older path still works:

```bash
openassist auth complete --provider codex-main --state <state> --code <code> --base-url http://127.0.0.1:3344
```

If the daemon is already healthy but the login still does not finish, treat that as an auth-completion problem, not a service failure. OpenAssist should now surface a sanitized account-linking error with safe upstream detail when available.

`openassist auth status --provider codex-main` remains redacted, but it should now tell you:

- whether the linked account exists
- which auth method is active when a linked account is loaded
- whether the current auth handle is chat-ready
- the token expiry if OpenAssist knows it
- a redacted status detail when the account is stored but not usable for chat

That linked-account state is stored as encrypted OAuth material in SQLite rather than as a plain file, and OpenAssist attempts automatic refresh before expiry and again on auth-style provider failures when a refresh token is available.

If quickstart was truly fresh and you chose Codex, the saved config should contain only `codex-main`. If you still see a stray `openai-main` on a fresh first-run path, that is a setup bug rather than intended compatibility behavior.

## Codex auth is chat-ready, but chat still fails

What it usually means:

- account login is complete
- service and channel health are fine
- the Codex backend rejected the provider request itself

What to run:

```bash
openassist auth status --provider codex-main
openassist service health
openassist channel status
openassist service logs --lines 250
```

What to look for:

- `Chat-ready auth: Yes`
- healthy service and channel state
- a provider error mentioning a Codex upstream request failure or a safe upstream request id

If auth is chat-ready and the service is healthy, do not treat that as a missing-auth problem. It is a provider request issue, and relinking the account blindly is unlikely to help.

Current Codex request truth:

- linked-account auth is stored as encrypted OAuth state in SQLite
- OpenAssist attempts refresh automatically before expiry and again on auth-style failures when possible
- the Codex provider now sends the runtime session id, account header, top-level instructions payload, and the upstream-aligned `/responses` fields Codex currently requires, including `store=false`, `stream=true`, and a prompt-cache key derived from the session id
- OpenAssist folds the returned Codex event stream back into a normal channel reply, so a healthy auth status plus a failing chat request should still be treated as a provider transport/contract issue
- if the backend still rejects the request after auth is chat-ready, focus on the provider request failure detail and safe request id instead of restarting setup blindly

## I cannot tell which provider reasoning setting is active

What it usually means:

- reasoning effort was left on the safe default and nothing is being sent
- the current primary provider is different from the one you edited
- the configured model does not support the selected reasoning or thinking field, so OpenAssist is omitting it safely

What to run:

```bash
openassist doctor
openassist doctor --json
openassist setup wizard
```

What to look for:

- `Primary provider`
- `Provider model`
- `Provider tuning`

Current operator story:

- OpenAI quickstart and wizard both expose `reasoningEffort`
- Codex quickstart and wizard both expose `reasoningEffort`
- OpenAI and Codex both support `low`, `medium`, `high`, and `xhigh`
- Anthropic `thinkingBudgetTokens` stays wizard-editable only
- OpenAI-compatible stays provider-default only

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

## A PR install says the next upgrade needs `--pr` or `--ref`

What it means:

- this install was created from a PR track such as `install.sh --pr 123` or `bootstrap.sh --pr 123`
- OpenAssist recorded `refs/pull/<n>/head` as the tracked ref
- later upgrades are intentionally explicit for PR tracks so they do not drift silently

What to run:

```bash
openassist doctor
openassist upgrade --dry-run --install-dir "$HOME/openassist" --pr 123
openassist upgrade --install-dir "$HOME/openassist" --pr 123
```

If you are done testing that PR and want to move the install back to the normal release track:

```bash
openassist upgrade --dry-run --install-dir "$HOME/openassist" --ref main
openassist upgrade --install-dir "$HOME/openassist" --ref main
```

Branch-track installs are different:

- `--ref feature/my-branch` continues following that branch normally
- only PR tracks force the next upgrade target to stay explicit

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
