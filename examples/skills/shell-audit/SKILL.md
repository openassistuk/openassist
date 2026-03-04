# Shell Audit Skill

This example skill shows how to summarize noisy shell output into concise diagnostics.

## Purpose

Use this skill when a command or log dump is too large and you need an error-first summary.

## Inputs

- raw command output text
- optional context fields passed by caller

When executed by the scheduler, runtime injects `_scheduler` metadata with `taskId` and `scheduledFor`.

## Entrypoint

- `scripts/summarize.mjs`

## Expected Output

- concise summary
- clear error or warning highlights
- suggested next checks
