#!/usr/bin/env bash
set -euo pipefail

channel=stable
version=""
interactive=auto
skip_service=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel) channel="${2:?Missing channel}"; shift 2 ;;
    --version) version="${2:?Missing version}"; shift 2 ;;
    --non-interactive) interactive=no; shift ;;
    --interactive) interactive=yes; shift ;;
    --skip-service) skip_service=1; shift ;;
    --release) shift ;;
    --help|-h) echo 'Install a verified release: --channel stable|preview --version VERSION --non-interactive --skip-service. For source use --source --ref main or --pr NUMBER.'; exit 0 ;;
    *) echo "Unsupported release installer option: $1" >&2; exit 1 ;;
  esac
done
[[ "$channel" == stable || "$channel" == preview ]] || { echo 'Channel must be stable or preview.' >&2; exit 1; }
[[ -z "$version" || "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] || { echo 'Invalid release version.' >&2; exit 1; }
for command in curl openssl gzip awk; do command -v "$command" >/dev/null || { echo "Missing release prerequisite: $command" >&2; exit 1; }; done
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target=linux-x64 ;;
  Linux-aarch64|Linux-arm64) target=linux-arm64 ;;
  Darwin-x86_64) target=darwin-x64 ;;
  Darwin-arm64) target=darwin-arm64 ;;
  *) echo 'Packaged releases support Linux glibc/macOS x64 and arm64.' >&2; exit 1 ;;
esac
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fetch() { curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --max-redirs 5 --max-time 120 "$1" -o "$2"; }
fetch 'https://raw.githubusercontent.com/openassistuk/openassist/main/release-public.pem' "$tmp/public.pem" || { echo 'The release trust anchor is unavailable. No application was installed; retry later or explicitly choose --source --ref main.' >&2; exit 1; }
grep -q -- '-----BEGIN PUBLIC KEY-----' "$tmp/public.pem" || { echo 'No production signing key is provisioned. Use --source --ref main until a signed release is available.' >&2; exit 1; }
if [[ -n "$version" ]]; then
  base="https://github.com/openassistuk/openassist/releases/download/v${version}"
elif [[ "$channel" == stable ]]; then
  base='https://github.com/openassistuk/openassist/releases/latest/download'
else
  fetch 'https://api.github.com/repos/openassistuk/openassist/releases?per_page=30' "$tmp/releases.json"
  preview_tag="$(awk '/"tag_name":/ {tag=$0; sub(/^.*"tag_name": *"/,"",tag); sub(/".*$/,"",tag)} /"prerelease": true/ {print tag; exit}' "$tmp/releases.json")"
  [[ "$preview_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-[A-Za-z0-9.-]+$ ]] || { echo 'No published preview release is available.' >&2; exit 1; }
  base="https://github.com/openassistuk/openassist/releases/download/$preview_tag"
fi
fetch "$base/release-index.txt" "$tmp/index" || { echo 'No verified release is available at the requested target. Installation stopped; source builds require explicit --source --ref main.' >&2; exit 1; }
fetch "$base/release-index.sig" "$tmp/index.sig"
openssl dgst -sha256 -verify "$tmp/public.pem" -signature "$tmp/index.sig" "$tmp/index" >/dev/null || { echo 'Release signature failed.' >&2; exit 1; }
signed_version="$(awk '$1 == "version" {print $2; count++} END {if(count != 1) exit 1}' "$tmp/index")"
signed_channel="$(awk '$1 == "channel" {print $2; count++} END {if(count != 1) exit 1}' "$tmp/index")"
[[ "$signed_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] || exit 1
if [[ -n "$version" ]]; then [[ "$version" == "$signed_version" ]] || exit 1
else [[ "$channel" == "$signed_channel" ]] || exit 1; fi
verified_fetch() {
  local line platform artifact hash bytes
  line="$(awk -v target="$1" '$1 == target { print; count++ } END { if(count != 1) exit 1 }' "$tmp/index")"
  read -r platform artifact hash bytes <<< "$line"
  [[ "$artifact" =~ ^[A-Za-z0-9._-]+$ && "$hash" =~ ^[a-f0-9]{64}$ && "$bytes" =~ ^[0-9]{1,9}$ && "$bytes" -gt 0 && "$bytes" -le 536870912 ]] || { echo 'Invalid signed artifact metadata.' >&2; exit 1; }
  fetch "$base/$artifact" "$2"
  [[ "$(wc -c < "$2" | tr -d ' ')" == "$bytes" ]] || { echo 'Artifact size mismatch.' >&2; exit 1; }
  [[ "$(openssl dgst -sha256 "$2" | awk '{print $NF}')" == "$hash" ]] || { echo 'Artifact checksum mismatch.' >&2; exit 1; }
}
verified_fetch "$target" "$tmp/release.tar.gz"
verified_fetch "$target-runtime" "$tmp/node.gz"
verified_fetch "$target-verifier" "$tmp/verifier.mjs"
gzip -dc "$tmp/node.gz" > "$tmp/node"
chmod 700 "$tmp/node"
"$tmp/node" "$tmp/verifier.mjs" "$tmp/release.tar.gz" "$tmp/app" "$signed_version"
channel="$signed_channel"
"$tmp/app/runtime/bin/node" "$tmp/app/apps/openassist-cli/dist/index.js" --help >/dev/null
export OPENASSIST_RELEASE_STAGE="$tmp/app"
export OPENASSIST_RELEASE_VERSION="$version"
export OPENASSIST_RELEASE_CHANNEL="$channel"
"$tmp/app/runtime/bin/node" --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const stage=process.env.OPENASSIST_RELEASE_STAGE;
const engine=await import(pathToFileURL(path.join(stage,'apps/openassist-cli/dist/lib/lifecycle-engine.js')));
const config=await import(pathToFileURL(path.join(stage,'apps/openassist-cli/node_modules/@openassist/config/dist/index.js')));
const state=await import(pathToFileURL(path.join(stage,'apps/openassist-cli/dist/lib/install-state.js')));
if(state.loadInstallState()) throw new Error('Existing installation detected. Use openassist update --release --channel stable (or explicit --version) to preserve its lifecycle history.');
const root=config.defaultManagedInstallDir();
const destination=path.join(root,'releases',`bootstrap-${Date.now()}`);
fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
fs.cpSync(stage,destination,{recursive:true,verbatimSymlinks:true});
fs.mkdirSync(path.dirname(config.defaultConfigPath()),{recursive:true,mode:0o700});
if(!fs.existsSync(config.defaultConfigPath())) config.writeDefaultConfig(config.defaultConfigPath());
if(!fs.existsSync(config.defaultEnvFilePath())) fs.writeFileSync(config.defaultEnvFilePath(),'# OpenAssist credentials\n',{mode:0o600});
await engine.executeUpdate({prepared:destination,channel:process.env.OPENASSIST_RELEASE_CHANNEL,version:process.env.OPENASSIST_RELEASE_VERSION||undefined,yes:true});
NODE
echo 'Ready now'
echo '- Verified packaged application installed with its private Node runtime.'
echo 'Needs action'
echo '- Complete provider/channel setup before first use.'
echo 'Next command'
echo "- $HOME/.local/bin/openassist setup"
if [[ "$interactive" == yes || ( "$interactive" == auto && -t 0 && -t 1 ) ]]; then
  args=(setup)
  [[ "$skip_service" == 0 ]] || args+=(--skip-service)
  "$HOME/.local/bin/openassist" "${args[@]}"
elif [[ "$skip_service" == 0 ]]; then
  "$HOME/.local/bin/openassist" service install
fi
