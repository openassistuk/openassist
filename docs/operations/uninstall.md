# Uninstall OpenAssist

```bash
openassist uninstall --dry-run
openassist uninstall
```

Default uninstall removes the owned service, matching command wrappers and managed application releases. It preserves config, credentials, conversations, logs, skills, helpers and backups. `openassist service uninstall` still removes only the service.

To delete canonical operator config and data too:

```bash
openassist uninstall --purge --dry-run
openassist uninstall --purge --yes
```

Purge is irreversible. Review the deletion list and preserve needed backups before using `--yes`. Backups remain because they may be needed for recovery; they contain secrets and require separate deliberate cleanup. Uninstall does not remove unrelated packages installed by helpers.

Ownership hashes and containment checks protect modified wrappers/service definitions, symbolic links, custom/shared paths and developer checkouts. Ambiguous paths require manual review. Legacy source installs use `openassist service uninstall` followed by inspection of their checkout/wrappers; the managed uninstaller refuses to guess ownership.

Packaged bootstrap records the hash of each exact marked shell PATH block it inserts. Dry-run lists `shellProfileEdits` separately from deleted files. Uninstall removes only a single matching, unchanged block in a recognized profile, preserving all surrounding settings. Edited/duplicate markers, symlinked profiles, unknown paths and pre-existing blocks remain with manual cleanup guidance. Keeping a shared `~/.local/bin` PATH entry is harmless and may serve other programs. Repeated uninstall reports no recorded installation.

See [common troubleshooting](common-troubleshooting.md) and [upgrade and recovery](upgrade-and-rollback.md).
