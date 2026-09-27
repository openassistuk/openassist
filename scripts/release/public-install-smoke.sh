#!/usr/bin/env bash
set -euo pipefail

version="${1:?Expected published version}"
channel="${2:?Expected stable or preview channel}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] || exit 1
[[ "$channel" == stable || "$channel" == preview ]] || exit 1
[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Run public install smoke only on disposable hosted runners.' >&2; exit 1; }

smoke_root="$(mktemp -d)"
trap 'rm -rf "$smoke_root"' EXIT
curl --proto '=https' --tlsv1.2 -fsSL 'https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh' -o "$smoke_root/install.sh"
unset OPENASSIST_STATE_ROOT OPENASSIST_ENV_FILE OPENASSIST_BOOTSTRAP_URL INIT_CWD

for selector in channel version; do
  export HOME="$smoke_root/$selector"
  export ZDOTDIR="$HOME"
  mkdir -p "$HOME"
  if [[ "$selector" == channel ]]; then args=(--channel "$channel"); else args=(--version "$version"); fi
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
