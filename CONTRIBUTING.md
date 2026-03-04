# Contributing to OpenAssist

Thanks for contributing. OpenAssist is operator-facing software and changes are held to production standards.

## Prerequisites

- Node.js `>=22`
- pnpm `>=10`
- Git

## Development Setup

```bash
pnpm install
pnpm -r build
```

## Branch and PR Policy

- `main` is PR-only. Do not push direct feature changes to `main`.
- Create a branch per change and open a pull request.
- Keep PRs decision-complete: implementation, tests, docs, and changelog updates in one change.

## Required Local Quality Gate

Run this before opening/updating a PR:

```bash
pnpm verify:all
```

For dependency security checks:

```bash
pnpm audit --prod --audit-level high
pnpm audit --audit-level high
```

## Engineering Rules

Read and follow:

- `AGENTS.md`
- `.agents/PLANS.md` (ExecPlan requirements for non-trivial scope)

Key expectations:

- no secret leakage in code, logs, tests, or docs
- no undocumented operator-facing behavior changes
- preserve policy gates and replay/idempotency behavior
- keep module boundaries intact

## Documentation and Changelog Requirements

If behavior changes, update docs in the same PR (at minimum `README.md`, `docs/README.md`, and affected docs under `docs/`).

Any operator-facing change must add a concrete entry to `CHANGELOG.md`.

## Testing Expectations

- Add/adjust unit and integration tests for changed behavior.
- Do not lower coverage thresholds to make CI pass.
- Keep CI workflows valid (`pnpm lint:workflows`).

## Security Reports

Do not disclose vulnerabilities publicly before a fix is available.

Use GitHub Private Vulnerability Reporting:

- `https://github.com/openassistuk/openassist/security/advisories/new`
