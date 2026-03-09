#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_URL="${OPENASSIST_BOOTSTRAP_URL:-}"
BOOTSTRAP_REF="main"
BOOTSTRAP_REF_EXPLICIT=0
BOOTSTRAP_PR=""
FORWARDED_ARGS=("$@")

usage_error() {
  echo "$1" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      if [[ -n "${BOOTSTRAP_PR}" ]]; then
        usage_error "Use either --ref or --pr, not both."
      fi
      [[ $# -ge 2 ]] || usage_error "Missing value for --ref"
      BOOTSTRAP_REF="$2"
      BOOTSTRAP_REF_EXPLICIT=1
      shift 2
      ;;
    --pr)
      if [[ "${BOOTSTRAP_REF_EXPLICIT}" -eq 1 ]]; then
        usage_error "Use either --ref or --pr, not both."
      fi
      [[ $# -ge 2 ]] || usage_error "Missing value for --pr"
      [[ "$2" =~ ^[1-9][0-9]*$ ]] || usage_error "Invalid pull request number: $2"
      BOOTSTRAP_PR="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "${BOOTSTRAP_REF_EXPLICIT}" -eq 1 && -n "${BOOTSTRAP_PR}" ]]; then
  usage_error "Use either --ref or --pr, not both."
fi

if [[ -z "${BOOTSTRAP_URL}" ]]; then
  if [[ -n "${BOOTSTRAP_PR}" ]]; then
    BOOTSTRAP_URL="https://raw.githubusercontent.com/openassistuk/openassist/refs/pull/${BOOTSTRAP_PR}/head/scripts/install/bootstrap.sh"
  else
    BOOTSTRAP_URL="https://raw.githubusercontent.com/openassistuk/openassist/${BOOTSTRAP_REF}/scripts/install/bootstrap.sh"
  fi
fi

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

exec "${bootstrap_path}" "${FORWARDED_ARGS[@]}"
