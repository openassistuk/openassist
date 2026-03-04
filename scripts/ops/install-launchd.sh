#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "install-launchd.sh is macOS-only"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pnpm --dir "${REPO_ROOT}" --filter @openassist/openassist-cli dev -- service install \
  --install-dir "${REPO_ROOT}" \
  --config "${REPO_ROOT}/openassist.toml" \
  --env-file "${HOME}/.config/openassist/openassistd.env"
