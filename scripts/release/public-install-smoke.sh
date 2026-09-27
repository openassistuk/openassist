#!/usr/bin/env bash
set -euo pipefail

version="${1:?Expected published version}"
channel="${2:?Expected stable or preview channel}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] || exit 1
[[ "$channel" == stable || "$channel" == preview ]] || exit 1
[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Run public install smoke only on disposable hosted runners.' >&2; exit 1; }

smoke_root="$(mktemp -d)"
trap 'rm -rf "$smoke_root"' EXIT
diagnose_downloads() {
  echo 'Public installation failed; checking unauthenticated download endpoints.' >&2
  for endpoint in \
    'https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh' \
    'https://raw.githubusercontent.com/openassistuk/openassist/main/scripts/install/bootstrap.sh' \
    'https://raw.githubusercontent.com/openassistuk/openassist/main/scripts/install/release.sh' \
    'https://raw.githubusercontent.com/openassistuk/openassist/main/release-public.pem' \
    'https://api.github.com/repos/openassistuk/openassist/releases?per_page=30'; do
    echo "$endpoint" >&2
    curl --proto '=https' --tlsv1.2 --silent --show-error --max-time 15 \
      --dump-header "$smoke_root/headers" --output /dev/null \
      --write-out 'HTTP %{http_code}\n' "$endpoint" >&2 || true
    if [[ -f "$smoke_root/headers" ]]; then
      awk 'tolower($0) ~ /^(http\/|x-ratelimit-|retry-after:)/' "$smoke_root/headers" >&2
    fi
  done
}
trap diagnose_downloads ERR
echo 'Downloading public installer entrypoint.'
curl --proto '=https' --tlsv1.2 -fsSL 'https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh' -o "$smoke_root/install.sh"
unset OPENASSIST_STATE_ROOT OPENASSIST_ENV_FILE OPENASSIST_BOOTSTRAP_URL INIT_CWD

for selector in channel version; do
  export HOME="$smoke_root/$selector"
  export ZDOTDIR="$HOME"
  mkdir -p "$HOME"
  if [[ "$selector" == channel ]]; then args=(--channel "$channel"); else args=(--version "$version"); fi
  echo "Installing public $selector selection for $version."
  bash "$smoke_root/install.sh" "${args[@]}" --non-interactive --skip-service
  cli="$HOME/.local/bin/openassist"
  [[ "$("$cli" --version)" == "$version" ]]
  [[ "$("$HOME/.local/bin/openassistd" --version)" == "$version" ]]
  "$cli" update check --json
  "$cli" update --version "$version" --dry-run --json
  "$cli" uninstall --dry-run --json
  "$cli" uninstall --yes --json
  [[ -f "$HOME/.config/openassist/openassist.toml" ]]
  [[ -f "$HOME/.config/openassist/openassistd.env" ]]
  [[ ! -e "$cli" ]]
  echo "Public $selector installation and data-preserving uninstall passed for $version."
done
