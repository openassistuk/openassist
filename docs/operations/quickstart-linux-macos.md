# Quickstart (Linux + macOS)

This guide is the fastest path to a working OpenAssist deployment and first end-user chat reply.

## Audience Tracks

- Operator track: install, configure, run service, validate health.
- End-user track: send a chat message in Telegram/Discord/WhatsApp and receive a reply.

## Platform Scope

- Linux: primary release target.
- macOS: supported operational path.

## Operator Track (10 minutes)

### 1) Install from GitHub

Linux/macOS interactive install:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh)"
```

Notes:

- Linux bootstrap can auto-install missing `git`, `node >= 22`, `pnpm >= 10`.
- On Debian/Ubuntu, bootstrap installs Node 22 from NodeSource when needed.
- If NodeSource still leaves Node below minimum, bootstrap attempts a secondary `npm+n` fallback install for Node 22.
- macOS bootstrap uses Homebrew for missing prerequisites; install Homebrew first if absent.
- If prerequisite auto-install fails, bootstrap prints manual remediation commands and (interactive mode) offers retry before exiting.
- For GitHub HTTPS auth failures, bootstrap now offers recovery choices (`retry`, `clear cached GitHub HTTPS credentials and retry`, `abort`) instead of immediate hard-exit.
- Workspace build-script policy is pre-approved for required postinstall packages (`esbuild`, `protobufjs`), so bootstrap should not require `pnpm approve-builds` during normal install.
- Linux service manager selection is automatic:
  - non-root shell: `systemd --user`
  - root shell: system-level `systemd`

### 2) Verify direct commands

```bash
openassist --help
openassistd --help
```

Bootstrap writes PATH profile snippets automatically. If commands are not available in the current shell session:

```bash
export PATH="$HOME/.local/bin:$PATH"
$HOME/.local/bin/openassist --help
$HOME/.local/bin/openassistd --help
```

### 3) Run strict onboarding if needed

If installer already ran onboarding, skip this step.

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart post-save service checks are recoverable:

- strict mode: retry or abort
- `--allow-incomplete`: retry, skip, or abort
- health probes automatically fall back to loopback when bind address is wildcard (`0.0.0.0` / `::`)
- prompt fields are validated and re-prompted (no silent numeric/timezone coercion); timezone uses guided `country/region -> city` selection
- quickstart includes assistant profile defaults (name/persona/preferences) for global main-agent memory plus per-session host bootstrap context

Secret baseline enforced during setup/runtime:

- backend is fixed to `security.secretsBackend="encrypted-file"`
- channel secret-like fields must be `env:VAR_NAME` references (plaintext secret values are rejected)
- provider OAuth `clientSecretEnv` must be a valid env-var name
- Unix secret files (`openassistd.env`, generated key file) are written and checked as owner-only

### 4) Confirm service is healthy

```bash
openassist service status
openassist service health
openassist time status
```

### 5) Connect auth and channels

Open provider auth flow:

```bash
openassist auth start --provider openai-main --account default --open-browser
openassist auth status
```

`openassist auth status` confirms status endpoint reachability; OAuth/API-key details are intentionally redacted in CLI output.

OAuth account linking requires provider OAuth client settings in `runtime.providers[].oauth`.

Recommended provider model baselines during onboarding:

- OpenAI: `gpt-5.2` (adapter auto-routes GPT-5/codex-class requests through OpenAI Responses API).
- Anthropic: `claude-sonnet-4-5` (or newer Sonnet 4.x model).

Check channel health:

```bash
openassist channel status
```

WhatsApp only:

```bash
openassist channel qr --id whatsapp-main
```

## End-User Track (First Message)

After operator setup is complete:

1. Open the configured chat destination:
- Telegram chat / group with bot
- Discord channel with bot
- WhatsApp chat linked via QR
2. Send a plain message (for example: `hello, are you online?`).
3. Confirm the bot replies.
4. If provider/auth/runtime is broken, bot returns an operational diagnostic message.
5. Send `/status` in chat for local runtime diagnostics without LLM/provider dependency.
6. Send `/profile` to view persistent global assistant profile memory, or update it with:
   - `/profile force=true; name=<name>; persona=<style>; prefs=<preferences>`
   - note: first-boot lock-in guard requires explicit `force=true` for profile changes

If no reply:

```bash
openassist service logs --lines 200 --follow
openassist channel status
openassist auth status
```

## Optional: Enable Autonomous Tool Use for One Session

Default is non-autonomous (`operator` profile). Only elevate when needed.

```bash
openassist policy-set --session <channel>:<conversationKey> --profile full-root
openassist tools status --session <channel>:<conversationKey>
openassist tools invocations --session <channel>:<conversationKey> --limit 20
```

## Quick Troubleshooting

- Service not running: `openassist service restart` then `openassist service health`.
- Service health OK but bot not responding: `openassist channel status` (channel startup is non-blocking; degraded connectors do not block daemon health).
- Timezone gate blocking scheduler: `openassist time status` then `openassist time confirm --timezone <Country/City>` (for example `America/New_York`).
- Upgrade safely: `openassist upgrade --dry-run` then `openassist upgrade --ref main`.

## Source-Checkout Alternative (Contributor Mode)

```bash
pnpm install
pnpm -r build
pnpm verify:all
```

Run directly from source:

```bash
pnpm --filter @openassist/openassistd dev -- run --config openassist.toml
pnpm --filter @openassist/openassist-cli dev -- setup quickstart --config openassist.toml --env-file ~/.config/openassist/openassistd.env --skip-service
```
