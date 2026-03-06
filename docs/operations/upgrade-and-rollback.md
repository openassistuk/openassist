# Upgrade and Rollback

OpenAssist upgrades are designed to be safe by default: restart and health checks are part of the flow, and rollback is automatic when post-upgrade health fails.

## Command

Installed command path:

```bash
openassist upgrade [--ref <git-ref>] [--install-dir <path>] [--skip-restart] [--dry-run]
```

Source checkout alternative:

```bash
pnpm --filter @openassist/openassist-cli dev -- upgrade [--ref <git-ref>] [--install-dir <path>] [--skip-restart] [--dry-run]
```

## Default Behavior

Upgrade sequence:

1. verify prerequisites (`git`, `node`, `pnpm`)
2. reject dirty working tree
3. fetch/pull target ref
4. run `pnpm install --frozen-lockfile`
5. run `pnpm -r build`
6. restart service unless `--skip-restart`
7. poll daemon health (`/v1/health`) for 60s
8. record new known-good commit in install state

## Rollback Behavior

If upgrade fails after commit capture:

1. checkout previous commit
2. reinstall and rebuild
3. restart service (unless skipped)
4. run health gate again
5. keep previous commit as known-good and return non-zero exit

## Dry Run

Use dry run before production upgrades:

```bash
openassist upgrade --dry-run
```

Dry run validates plan and prerequisites without mutating local checkout or service state.

## Operational Notes

- Keep env file and config backups in place before major version upgrades.
- If rollback health check also fails, inspect service logs and restore from repository backups manually.
- After major config-schema shifts, run `openassist setup quickstart --skip-service` or `openassist config validate` before restart.
- After upgrading into the native web tooling release, confirm `openassist tools status --session <channel>:<conversationKey>` shows the expected native web mode and awareness summary for a representative session.
- If `tools.web.searchMode` is `api-only` or `hybrid`, confirm the env file still contains `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY` where intended.
- Security baseline checks during upgrade:
  - unsupported `security.secretsBackend` values now fail fast (only `encrypted-file` is supported)
  - plaintext secret-like channel settings are rejected by config validation
  - invalid provider OAuth `clientSecretEnv` naming now fails validation
