#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3344}"
URL="${BASE_URL%/}/v1/health"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for health checks"
  exit 2
fi

response="$(curl -fsS "$URL")" || {
  echo "health check failed: daemon unreachable at $URL"
  exit 1
}

if echo "$response" | grep -q '"status":"ok"'; then
  echo "openassist health: ok"
  exit 0
fi

echo "openassist health response did not include status ok"
echo "$response"
exit 1
