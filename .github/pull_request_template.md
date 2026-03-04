## Summary

Describe the operator-facing change and why it is needed.

## Scope

- In scope:
- Out of scope:

## Validation

List exact commands run and results.

```bash
pnpm verify:all
pnpm audit --prod --audit-level high
pnpm audit --audit-level high
```

## Checklist

- [ ] I ran `pnpm verify:all` locally.
- [ ] I updated docs for behavior changes (`README.md`, `docs/README.md`, and relevant docs).
- [ ] I added/updated tests for changed behavior.
- [ ] I added a concrete `CHANGELOG.md` entry for operator-facing changes.
- [ ] I confirmed no secrets or private credentials are present in code/logs/docs.
- [ ] For non-trivial scope, I followed `AGENTS.md` and `.agents/PLANS.md`.
