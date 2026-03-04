#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_URL="${OPENASSIST_BOOTSTRAP_URL:-https://raw.githubusercontent.com/openassistuk/openassist/main/scripts/install/bootstrap.sh}"

if [[ ! -t 0 && -t 1 && -r /dev/tty ]]; then
  exec </dev/tty
fi

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
}

require_cmd curl

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

bootstrap_path="${tmp_dir}/bootstrap.sh"
curl -fsSL "${BOOTSTRAP_URL}" -o "${bootstrap_path}"
chmod 755 "${bootstrap_path}"

exec "${bootstrap_path}" "$@"

