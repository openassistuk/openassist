#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/openassist"
REPO_URL=""
REF=""
SOURCE_REPO_ROOT=""
SKIP_SERVICE=0
INTERACTIVE=0
EXPLICIT_NON_INTERACTIVE=0
ALLOW_INCOMPLETE=0
ALLOW_DIRTY=0
AUTO_INSTALL_PREREQS=1
LOCAL_BIN_DIR="${HOME}/.local/bin"
GLOBAL_BIN_DIR="${OPENASSIST_GLOBAL_BIN_DIR:-/usr/local/bin}"

# When this script is piped from curl in an interactive shell, stdin is often
# a pipe instead of a TTY. Reattach stdin to /dev/tty so interactive setup can
# still run by default for real users.
if [[ ! -t 0 && -t 1 && -r /dev/tty ]]; then
  exec </dev/tty
fi

usage() {
  cat <<'EOF'
OpenAssist bootstrap installer

Usage:
  bootstrap.sh [options]

Options:
  --install-dir <path>          Install directory (default: $HOME/openassist)
  --repo-url <url>              Git repository URL
  --ref <git-ref>               Git ref/branch/tag to checkout
  --interactive                 Run guided quickstart onboarding after build
  --non-interactive             Explicitly force non-interactive mode
  --allow-incomplete            Allow quickstart completion with warnings/errors (interactive only)
  --skip-service                Do not install/start user service
  --allow-dirty                 Allow updates in existing dirty git working tree
  --auto-install-prereqs        Auto-install missing prerequisites (default)
  --no-auto-install-prereqs     Disable prerequisite auto-install and fail if missing
  -h, --help                    Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --repo-url)
      REPO_URL="$2"
      shift 2
      ;;
    --ref)
      REF="$2"
      shift 2
      ;;
    --interactive)
      INTERACTIVE=1
      shift
      ;;
    --non-interactive)
      EXPLICIT_NON_INTERACTIVE=1
      shift
      ;;
    --allow-incomplete)
      ALLOW_INCOMPLETE=1
      shift
      ;;
    --skip-service)
      SKIP_SERVICE=1
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    --auto-install-prereqs)
      AUTO_INSTALL_PREREQS=1
      shift
      ;;
    --no-auto-install-prereqs)
      AUTO_INSTALL_PREREQS=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "${INTERACTIVE}" -eq 1 && "${EXPLICIT_NON_INTERACTIVE}" -eq 1 ]]; then
  echo "Cannot use --interactive and --non-interactive together."
  exit 1
fi

if [[ "${INTERACTIVE}" -ne 1 && "${EXPLICIT_NON_INTERACTIVE}" -ne 1 ]]; then
  if [[ -t 0 && -t 1 ]]; then
    INTERACTIVE=1
  fi
fi

if [[ "${ALLOW_INCOMPLETE}" -eq 1 && "${INTERACTIVE}" -ne 1 ]]; then
  echo "Warning: --allow-incomplete is only used in interactive mode; ignoring."
fi

if [[ "${AUTO_INSTALL_PREREQS}" -eq 0 ]]; then
  echo "Prerequisite auto-install disabled."
fi

bootstrap_mode() {
  if [[ "${INTERACTIVE}" -eq 1 ]]; then
    echo "interactive"
    return
  fi
  echo "non-interactive"
}

print_bootstrap_plan() {
  local quickstart_mode="yes"
  local service_mode="yes"
  if [[ "${INTERACTIVE}" -ne 1 ]]; then
    quickstart_mode="no"
  fi
  if [[ "${SKIP_SERVICE}" -eq 1 ]]; then
    service_mode="no"
  fi

  echo "OpenAssist lifecycle plan"
  echo "  install model: repo-backed checkout"
  echo "  bootstrap mode: $(bootstrap_mode)"
  echo "  install dir: ${INSTALL_DIR}"
  echo "  requested ref: ${REF:-auto}"
  echo "  quickstart after build: ${quickstart_mode}"
  echo "  service install/restart: ${service_mode}"
}

persist_install_state() {
  OPENASSIST_STATE_FILE="${STATE_FILE}" \
  OPENASSIST_INSTALL_DIR="${INSTALL_DIR}" \
  OPENASSIST_REPO_URL="${REPO_URL}" \
  OPENASSIST_TRACKED_REF="${TRACKED_REF}" \
  OPENASSIST_SERVICE_KIND="${SERVICE_KIND}" \
  OPENASSIST_CONFIG_PATH="${CONFIG_PATH}" \
  OPENASSIST_ENV_FILE="${ENV_FILE}" \
  OPENASSIST_COMMIT="${COMMIT}" \
  node <<'EOF'
const fs = require("node:fs");
const path = require("node:path");

const statePath = process.env.OPENASSIST_STATE_FILE;
let existing = {};
if (statePath && fs.existsSync(statePath)) {
  try {
    existing = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    existing = {};
  }
}

const merged = {
  ...existing,
  installDir: process.env.OPENASSIST_INSTALL_DIR,
  repoUrl: process.env.OPENASSIST_REPO_URL || existing.repoUrl || "",
  trackedRef: process.env.OPENASSIST_TRACKED_REF || existing.trackedRef || "main",
  serviceManager: process.env.OPENASSIST_SERVICE_KIND || existing.serviceManager || "systemd-user",
  configPath: process.env.OPENASSIST_CONFIG_PATH || existing.configPath,
  envFilePath: process.env.OPENASSIST_ENV_FILE || existing.envFilePath,
  lastKnownGoodCommit: process.env.OPENASSIST_COMMIT || existing.lastKnownGoodCommit || "",
  updatedAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(statePath), { recursive: true });
fs.writeFileSync(statePath, JSON.stringify(merged, null, 2), "utf8");
EOF
}

print_bootstrap_summary() {
  local doctor_json=""
  doctor_json="$(node "${INSTALL_DIR}/apps/openassist-cli/dist/index.js" doctor --json 2>/dev/null || true)"
  if [[ -n "${doctor_json}" ]]; then
    OPENASSIST_DOCTOR_JSON="${doctor_json}" \
    OPENASSIST_BOOTSTRAP_MODE="$(bootstrap_mode)" \
    OPENASSIST_INTERACTIVE="${INTERACTIVE}" \
    OPENASSIST_SKIP_SERVICE="${SKIP_SERVICE}" \
    OPENASSIST_AUTO_INSTALL_PREREQS="${AUTO_INSTALL_PREREQS}" \
    OPENASSIST_ALLOW_DIRTY="${ALLOW_DIRTY}" \
    OPENASSIST_INSTALL_DIR="${INSTALL_DIR}" \
    OPENASSIST_CONFIG_PATH="${CONFIG_PATH}" \
    OPENASSIST_ENV_FILE="${ENV_FILE}" \
    OPENASSIST_LOCAL_WRAPPER="${LOCAL_BIN_DIR}/openassist" \
    node <<'EOF'
let report = {};
try {
  const raw = process.env.OPENASSIST_DOCTOR_JSON || "";
  const trimmed = raw.trim();
  if (trimmed.length > 0 && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
    report = JSON.parse(trimmed);
  }
} catch (error) {
  console.error(
    `Warning: bootstrap could not parse doctor --json output (${error instanceof Error ? error.message : String(error)}). Falling back to a minimal summary.`
  );
}
const ready = [];
const needs = [];
const readyItems = Array.isArray(report?.sections?.readyNow) ? report.sections.readyNow : [];
const firstReplyItems = Array.isArray(report?.sections?.needsActionBeforeFirstReply)
  ? report.sections.needsActionBeforeFirstReply
  : [];
const fullAccessItems = Array.isArray(report?.sections?.needsActionBeforeFullAccess)
  ? report.sections.needsActionBeforeFullAccess
  : [];
const upgradeItems = Array.isArray(report?.sections?.needsActionBeforeUpgrade)
  ? report.sections.needsActionBeforeUpgrade
  : [];

for (const item of readyItems) {
  ready.push(`  - ${item.label}: ${item.detail}`);
}
for (const item of [...firstReplyItems, ...fullAccessItems, ...upgradeItems]) {
  const suffix = item.nextStep ? ` Next step: ${item.nextStep}` : "";
  needs.push(`  - ${item.label}: ${item.detail}.${suffix}`.trimEnd());
}

if (process.env.OPENASSIST_AUTO_INSTALL_PREREQS === "0") {
  ready.push("  - Prerequisite auto-install was disabled, so bootstrap left package fixes under operator control.");
}
if (process.env.OPENASSIST_ALLOW_DIRTY === "1") {
  ready.push("  - Bootstrap was allowed to continue with local code changes in the checkout.");
}

const localWrapper = process.env.OPENASSIST_LOCAL_WRAPPER || "openassist";
const quoteArg = (value) => `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const setupCommand = [
  "openassist",
  "setup",
  "--install-dir",
  process.env.OPENASSIST_INSTALL_DIR,
  "--config",
  process.env.OPENASSIST_CONFIG_PATH,
  "--env-file",
  process.env.OPENASSIST_ENV_FILE
].map((part, index) => (index === 0 ? part : quoteArg(part))).join(" ");
const wrapperReady = readyItems.some((item) => item.id === "wrappers.path");
if (!wrapperReady) {
  needs.unshift(`  - This shell may need a new login shell before 'openassist' is on PATH. Fallback: ${localWrapper}`);
}

ready.push("  - pnpm version notices are informational.");
needs.push(
  "  - Before WhatsApp or media use: if pnpm reported skipped build scripts, approve them before relying on WhatsApp image or document handling."
);

if (process.env.OPENASSIST_INTERACTIVE !== "1") {
  needs.unshift(
    `  - Guided onboarding was not run because bootstrap stayed non-interactive. Next step: ${setupCommand}`
  );
}
if (process.env.OPENASSIST_SKIP_SERVICE === "1") {
  needs.unshift(
    `  - Service install and health checks were skipped. Next step: openassist service install --install-dir "${process.env.OPENASSIST_INSTALL_DIR}" --config "${process.env.OPENASSIST_CONFIG_PATH}" --env-file "${process.env.OPENASSIST_ENV_FILE}"`
  );
}

let nextCommand = "openassist service health";
if (process.env.OPENASSIST_INTERACTIVE !== "1") {
  nextCommand = setupCommand;
} else if (process.env.OPENASSIST_SKIP_SERVICE === "1") {
  nextCommand = `openassist service install --install-dir "${process.env.OPENASSIST_INSTALL_DIR}" --config "${process.env.OPENASSIST_CONFIG_PATH}" --env-file "${process.env.OPENASSIST_ENV_FILE}"`;
} else if (firstReplyItems.length > 0) {
  nextCommand = firstReplyItems[0]?.nextStep || "openassist doctor";
}

console.log("");
console.log("Bootstrap complete.");
console.log("Ready now");
if (ready.length === 0) {
  console.log("  - None.");
} else {
  for (const line of ready) {
    console.log(line);
  }
}
console.log("Needs action");
if (needs.length === 0) {
  console.log("  - None.");
} else {
  for (const line of needs) {
    console.log(line);
  }
}
console.log("Next command");
console.log(`  - ${nextCommand}`);
EOF
    return
  fi

  echo ""
  echo "Bootstrap complete."
  echo "Ready now"
  echo "  - Repo checkout built at ${INSTALL_DIR}"
  echo "  - Config file available at ${CONFIG_PATH}"
  echo "  - Env file available at ${ENV_FILE}"
  echo "Needs action"
  if [[ "${INTERACTIVE}" -eq 1 && "${SKIP_SERVICE}" -eq 1 ]]; then
    echo "  - Service install and health checks were skipped."
  elif [[ "${INTERACTIVE}" -ne 1 ]]; then
    echo "  - Guided onboarding was not run because bootstrap stayed non-interactive. Next step: openassist setup --install-dir \"${INSTALL_DIR}\" --config \"${CONFIG_PATH}\" --env-file \"${ENV_FILE}\""
  else
    echo "  - None."
  fi
  echo "Next command"
  if [[ "${INTERACTIVE}" -ne 1 ]]; then
    echo "  - openassist setup --install-dir \"${INSTALL_DIR}\" --config \"${CONFIG_PATH}\" --env-file \"${ENV_FILE}\""
  else
    echo "  - ${LOCAL_BIN_DIR}/openassist --help"
  fi
}

print_bootstrap_plan

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}"
    return 1
  fi
  return 0
}

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
    return
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi
  echo "This step requires root privileges, but sudo is not available."
  return 1
}

node_major() {
  if ! command -v node >/dev/null 2>&1; then
    echo 0
    return
  fi
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

pnpm_major() {
  if ! command -v pnpm >/dev/null 2>&1; then
    echo 0
    return
  fi
  pnpm --version 2>/dev/null | awk -F. '{print $1}' || echo 0
}

detect_os_kind() {
  case "$(uname -s)" in
    Linux) echo "linux" ;;
    Darwin) echo "darwin" ;;
    *)
      echo "unsupported"
      ;;
  esac
}

detect_pkg_manager() {
  local os_kind="$1"
  if [[ "${os_kind}" == "darwin" ]]; then
    if command -v brew >/dev/null 2>&1; then
      echo "brew"
      return
    fi
    echo ""
    return
  fi

  for pm in apt-get dnf yum pacman zypper apk; do
    if command -v "${pm}" >/dev/null 2>&1; then
      echo "${pm}"
      return
    fi
  done
  echo ""
}

install_base_prereqs() {
  local os_kind="$1"
  local pkg_manager="$2"
  if [[ "${os_kind}" == "darwin" ]]; then
    brew update
    brew install git || true
    return
  fi

  case "${pkg_manager}" in
    apt-get)
      run_as_root apt-get update -y
      run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y git curl ca-certificates
      ;;
    dnf)
      run_as_root dnf install -y git curl ca-certificates
      ;;
    yum)
      run_as_root yum install -y git curl ca-certificates
      ;;
    pacman)
      run_as_root pacman -Sy --noconfirm git curl ca-certificates
      ;;
    zypper)
      run_as_root zypper --non-interactive refresh
      run_as_root zypper --non-interactive install git curl ca-certificates
      ;;
    apk)
      run_as_root apk add --no-cache git curl ca-certificates
      ;;
    *)
      echo "Unsupported Linux package manager: ${pkg_manager}"
      return 1
      ;;
  esac
}

install_node_runtime() {
  local os_kind="$1"
  local pkg_manager="$2"
  if [[ "${os_kind}" == "darwin" ]]; then
    brew install node@22 || brew install node
    brew link --overwrite --force node@22 >/dev/null 2>&1 || true
    return
  fi

  case "${pkg_manager}" in
    apt-get)
      echo "Installing Node.js 22.x via NodeSource (Debian/Ubuntu)..."
      run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates gnupg
      if curl -fsSL https://deb.nodesource.com/setup_22.x | run_as_root bash -; then
        run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
      else
        echo "NodeSource setup failed; falling back to distro nodejs package."
        run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs npm
      fi

      if [[ "$(node_major)" -lt 22 ]]; then
        echo "Node.js is still <22 after package install; attempting fallback install via npm+n..."
        if command -v npm >/dev/null 2>&1; then
          if [[ "$(id -u)" -eq 0 ]]; then
            if ! (npm install -g n && n 22); then
              echo "Fallback install via npm+n failed (root mode)."
            fi
          elif command -v sudo >/dev/null 2>&1; then
            if ! (sudo npm install -g n && sudo n 22); then
              echo "Fallback install via npm+n failed (sudo mode)."
            fi
          else
            if ! (npm install -g n && n 22); then
              echo "Fallback install via npm+n failed (user mode)."
            fi
          fi
          hash -r
        fi
      fi
      ;;
    dnf)
      run_as_root dnf install -y nodejs npm
      ;;
    yum)
      run_as_root yum install -y nodejs npm
      ;;
    pacman)
      run_as_root pacman -Sy --noconfirm nodejs npm
      ;;
    zypper)
      run_as_root zypper --non-interactive install nodejs npm
      ;;
    apk)
      run_as_root apk add --no-cache nodejs npm
      ;;
    *)
      echo "Unsupported Linux package manager: ${pkg_manager}"
      return 1
      ;;
  esac
}

install_pnpm_runtime() {
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@10.26.0 --activate
    return
  fi

  if command -v npm >/dev/null 2>&1; then
    if [[ "$(id -u)" -eq 0 ]]; then
      npm install -g pnpm
    elif command -v sudo >/dev/null 2>&1; then
      sudo npm install -g pnpm
    else
      npm install -g pnpm
    fi
    return
  fi

  echo "Cannot install pnpm automatically: neither corepack nor npm is available."
  return 1
}

declare -a MISSING_PREREQS=()

collect_missing_prereqs() {
  MISSING_PREREQS=()

  if ! command -v git >/dev/null 2>&1; then
    MISSING_PREREQS+=("git")
  fi

  if ! command -v node >/dev/null 2>&1; then
    MISSING_PREREQS+=("node>=22")
  else
    local node_v
    node_v="$(node_major)"
    if [[ "${node_v}" -lt 22 ]]; then
      MISSING_PREREQS+=("node>=22")
    fi
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    MISSING_PREREQS+=("pnpm>=10")
  else
    local pnpm_v
    pnpm_v="$(pnpm_major)"
    if [[ "${pnpm_v}" -lt 10 ]]; then
      MISSING_PREREQS+=("pnpm>=10")
    fi
  fi
}

prompt_yes_no() {
  local question="$1"
  local default_answer="${2:-Y}"
  local prompt="[Y/n]"
  if [[ "${default_answer}" == "N" ]]; then
    prompt="[y/N]"
  fi

  if [[ ! -t 0 || ! -t 1 ]]; then
    [[ "${default_answer}" == "Y" ]]
    return
  fi

  while true; do
    read -r -p "${question} ${prompt} " answer || true
    if [[ -z "${answer}" ]]; then
      [[ "${default_answer}" == "Y" ]]
      return
    fi
    case "${answer}" in
      [Yy]|[Yy][Ee][Ss])
        return 0
        ;;
      [Nn]|[Nn][Oo])
        return 1
        ;;
    esac
  done
}

prompt_choice() {
  local question="$1"
  local default_choice="$2"
  shift 2
  local options=("$@")

  if [[ ! -t 0 || ! -t 1 ]]; then
    echo "${default_choice}"
    return
  fi

  while true; do
    echo "${question}" >&2
    for option in "${options[@]}"; do
      local key="${option%%:*}"
      local label="${option#*:}"
      if [[ "${key}" == "${default_choice}" ]]; then
        echo "  [${key}] ${label} (default)" >&2
      else
        echo "  [${key}] ${label}" >&2
      fi
    done

    read -r -p "Choose option: " answer || true
    if [[ -z "${answer}" ]]; then
      echo "${default_choice}"
      return
    fi

    for option in "${options[@]}"; do
      local key="${option%%:*}"
      if [[ "${answer}" == "${key}" ]]; then
        echo "${key}"
        return
      fi
    done
    echo "Invalid choice: ${answer}" >&2
  done
}

clear_cached_github_credentials() {
  if ! command -v git >/dev/null 2>&1; then
    return
  fi
  printf 'protocol=https\nhost=github.com\n\n' | git credential reject >/dev/null 2>&1 || true
}

run_git_step() {
  local description="$1"
  shift
  local cmd=("$@")

  while true; do
    if "${cmd[@]}"; then
      return 0
    fi

    local exit_code=$?
    if [[ "${INTERACTIVE}" -ne 1 ]]; then
      echo "${description} failed."
      return "${exit_code}"
    fi

    echo "${description} failed."
    echo "If GitHub HTTPS authentication fails, verify your configured credentials and retry."
    local action
    action="$(prompt_choice \
      "Choose next step for repository authentication recovery" \
      "r" \
      "r:Retry now" \
      "c:Clear cached GitHub HTTPS credentials and retry" \
      "a:Abort bootstrap")"

    if [[ "${action}" == "r" ]]; then
      continue
    fi
    if [[ "${action}" == "c" ]]; then
      clear_cached_github_credentials
      continue
    fi
    return "${exit_code}"
  done
}

print_prereq_troubleshooting() {
  local os_kind="$1"
  local pkg_manager="$2"
  shift 2
  local missing=("$@")

  echo ""
  echo "Troubleshooting guidance:"
  if [[ "${#missing[@]}" -gt 0 ]]; then
    echo "Missing prerequisites:"
    printf '  - %s\n' "${missing[@]}"
  fi

  if [[ "${os_kind}" == "darwin" ]]; then
    if [[ -z "${pkg_manager}" ]]; then
      echo "Homebrew is required for automatic prerequisite installation on macOS."
      echo "Install Homebrew first: https://brew.sh"
      echo "Then rerun bootstrap."
    else
      echo "Try these commands manually:"
      echo "  brew update"
      echo "  brew install git node@22"
      echo "  brew link --overwrite --force node@22"
      echo "  corepack enable && corepack prepare pnpm@10.26.0 --activate"
    fi
    return
  fi

  case "${pkg_manager}" in
    apt-get)
      echo "Try these commands manually:"
      echo "  sudo apt-get update"
      echo "  sudo apt-get install -y curl ca-certificates gnupg git"
      echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -"
      echo "  sudo apt-get install -y nodejs"
      echo "  corepack enable && corepack prepare pnpm@10.26.0 --activate"
      ;;
    dnf|yum)
      echo "Try these commands manually:"
      echo "  sudo ${pkg_manager} install -y git curl ca-certificates nodejs npm"
      echo "  corepack enable && corepack prepare pnpm@10.26.0 --activate"
      ;;
    pacman)
      echo "Try these commands manually:"
      echo "  sudo pacman -Sy --noconfirm git curl ca-certificates nodejs npm"
      echo "  corepack enable && corepack prepare pnpm@10.26.0 --activate"
      ;;
    zypper)
      echo "Try these commands manually:"
      echo "  sudo zypper --non-interactive refresh"
      echo "  sudo zypper --non-interactive install git curl ca-certificates nodejs npm"
      echo "  corepack enable && corepack prepare pnpm@10.26.0 --activate"
      ;;
    apk)
      echo "Try these commands manually:"
      echo "  sudo apk add --no-cache git curl ca-certificates nodejs npm"
      echo "  corepack enable && corepack prepare pnpm@10.26.0 --activate"
      ;;
    *)
      echo "No known automatic troubleshooting commands for this platform/package-manager pair."
      ;;
  esac
  echo "After fixing prerequisites, rerun bootstrap."
}

append_path_snippet() {
  local profile_file="$1"
  local start_marker="# >>> openassist path >>>"
  local end_marker="# <<< openassist path <<<"

  mkdir -p "$(dirname "${profile_file}")"
  if [[ -f "${profile_file}" ]] && grep -Fq "${start_marker}" "${profile_file}"; then
    return 1
  fi

  {
    echo ""
    echo "${start_marker}"
    echo "if [[ \":\$PATH:\" != *\":${LOCAL_BIN_DIR}:\"* ]]; then"
    echo "  export PATH=\"${LOCAL_BIN_DIR}:\$PATH\""
    echo "fi"
    echo "${end_marker}"
  } >> "${profile_file}"

  return 0
}

ensure_local_bin_on_path() {
  local shell_name
  shell_name="$(basename "${SHELL:-}")"
  local zsh_home="${ZDOTDIR:-${HOME}}"
  local updated_profiles=()
  local profile=""

  case "${shell_name}" in
    bash)
      for profile in "${HOME}/.bashrc" "${HOME}/.profile"; do
        if append_path_snippet "${profile}"; then
          updated_profiles+=("${profile}")
        fi
      done
      ;;
    zsh)
      for profile in "${zsh_home}/.zshrc" "${zsh_home}/.zprofile"; do
        if append_path_snippet "${profile}"; then
          updated_profiles+=("${profile}")
        fi
      done
      ;;
    *)
      profile="${HOME}/.profile"
      if append_path_snippet "${profile}"; then
        updated_profiles+=("${profile}")
      fi
      ;;
  esac

  if [[ ":${PATH}:" != *":${LOCAL_BIN_DIR}:"* ]]; then
    export PATH="${LOCAL_BIN_DIR}:${PATH}"
  fi

  if [[ "${#updated_profiles[@]}" -gt 0 ]]; then
    echo "PATH profile updated for OpenAssist wrappers:"
    printf '  - %s\n' "${updated_profiles[@]}"
  else
    echo "PATH profile already contains OpenAssist wrapper setup."
  fi
}

install_global_wrappers_if_possible() {
  if [[ -z "${GLOBAL_BIN_DIR}" ]]; then
    return 1
  fi

  if [[ ! -d "${GLOBAL_BIN_DIR}" ]]; then
    if [[ "$(id -u)" -eq 0 ]]; then
      mkdir -p "${GLOBAL_BIN_DIR}"
    else
      return 1
    fi
  fi

  if [[ ! -w "${GLOBAL_BIN_DIR}" ]]; then
    return 1
  fi

  ln -sf "${LOCAL_BIN_DIR}/openassist" "${GLOBAL_BIN_DIR}/openassist"
  ln -sf "${LOCAL_BIN_DIR}/openassistd" "${GLOBAL_BIN_DIR}/openassistd"
  return 0
}

ensure_prereqs() {
  collect_missing_prereqs
  if [[ "${#MISSING_PREREQS[@]}" -eq 0 ]]; then
    return
  fi

  echo "Missing prerequisites detected:"
  printf '  - %s\n' "${MISSING_PREREQS[@]}"

  local os_kind
  os_kind="$(detect_os_kind)"
  if [[ "${os_kind}" == "unsupported" ]]; then
    echo "Unsupported platform for bootstrap prerequisite installation: $(uname -s)"
    exit 1
  fi

  local pkg_manager
  pkg_manager="$(detect_pkg_manager "${os_kind}")"
  if [[ -z "${pkg_manager}" ]]; then
    if [[ "${os_kind}" == "darwin" ]]; then
      echo "Homebrew is required for automatic prerequisite installation on macOS."
      echo "Install Homebrew first: https://brew.sh"
    else
      echo "No supported Linux package manager was found for automatic prerequisite installation."
    fi
    print_prereq_troubleshooting "${os_kind}" "${pkg_manager}" "${MISSING_PREREQS[@]}"
    exit 1
  fi

  if [[ "${AUTO_INSTALL_PREREQS}" -ne 1 ]]; then
    echo "Re-run with --auto-install-prereqs to let bootstrap install missing dependencies."
    print_prereq_troubleshooting "${os_kind}" "${pkg_manager}" "${MISSING_PREREQS[@]}"
    exit 1
  fi

  if [[ "${INTERACTIVE}" -eq 1 ]]; then
    if ! prompt_yes_no "Install missing prerequisites automatically?" "Y"; then
      echo "Bootstrap aborted because required prerequisites are missing."
      print_prereq_troubleshooting "${os_kind}" "${pkg_manager}" "${MISSING_PREREQS[@]}"
      exit 1
    fi
  fi

  local attempt=1
  local max_attempts=1
  if [[ "${INTERACTIVE}" -eq 1 ]]; then
    max_attempts=3
  fi

  while true; do
    echo "Attempting prerequisite installation using ${pkg_manager} (attempt ${attempt}/${max_attempts})..."
    install_base_prereqs "${os_kind}" "${pkg_manager}"
    hash -r

    if ! command -v node >/dev/null 2>&1 || [[ "$(node_major)" -lt 22 ]]; then
      echo "Installing Node.js runtime..."
      install_node_runtime "${os_kind}" "${pkg_manager}"
      hash -r
    fi

    if ! command -v pnpm >/dev/null 2>&1 || [[ "$(pnpm_major)" -lt 10 ]]; then
      echo "Installing pnpm..."
      install_pnpm_runtime
      hash -r
    fi

    collect_missing_prereqs
    if [[ "${#MISSING_PREREQS[@]}" -eq 0 ]]; then
      break
    fi

    echo "Automatic prerequisite installation did not fully succeed on attempt ${attempt}."
    printf '  - still missing: %s\n' "${MISSING_PREREQS[@]}"
    print_prereq_troubleshooting "${os_kind}" "${pkg_manager}" "${MISSING_PREREQS[@]}"

    if [[ "${INTERACTIVE}" -ne 1 || "${attempt}" -ge "${max_attempts}" ]]; then
      break
    fi

    local choice
    choice="$(prompt_choice \
      "Choose next step for prerequisite recovery" \
      "r" \
      "r:Retry automatic installation" \
      "m:Exit and fix manually")"
    if [[ "${choice}" != "r" ]]; then
      break
    fi
    attempt=$((attempt + 1))
  done

  collect_missing_prereqs
  if [[ "${#MISSING_PREREQS[@]}" -ne 0 ]]; then
    echo "Prerequisites are still incomplete."
    print_prereq_troubleshooting "${os_kind}" "${pkg_manager}" "${MISSING_PREREQS[@]}"
    exit 1
  fi

  echo "Prerequisite checks passed."
}

ensure_prereqs

if [[ -z "${REPO_URL}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  SOURCE_REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
  if git -C "${SOURCE_REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    REPO_URL="$(git -C "${SOURCE_REPO_ROOT}" config --get remote.origin.url || true)"
  fi
fi

if [[ -z "${REPO_URL}" ]]; then
  REPO_URL="${OPENASSIST_DEFAULT_REPO_URL:-https://github.com/openassistuk/openassist.git}"
fi

mkdir -p "$(dirname "${INSTALL_DIR}")"

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  install_abs="$(cd "${INSTALL_DIR}" && pwd)"
  source_abs=""
  if [[ -n "${SOURCE_REPO_ROOT}" && -d "${SOURCE_REPO_ROOT}/.git" ]]; then
    source_abs="$(cd "${SOURCE_REPO_ROOT}" && pwd)"
  fi
  if [[ -n "${source_abs}" && "${install_abs}" == "${source_abs}" ]]; then
    echo "Using existing local checkout at ${INSTALL_DIR}; syncing latest changes."
  else
    echo "Existing install detected at ${INSTALL_DIR}; updating in place."
  fi
  if [[ "${ALLOW_DIRTY}" -ne 1 ]]; then
    dirty="$(git -C "${INSTALL_DIR}" status --porcelain)"
    if [[ -n "${dirty}" ]]; then
      echo "Install directory has uncommitted changes. Re-run with --allow-dirty to proceed."
      exit 1
    fi
  fi
  run_git_step "Git fetch failed for ${INSTALL_DIR}" git -C "${INSTALL_DIR}" fetch --all --prune

  if [[ -z "${REF}" ]]; then
    branch="$(git -C "${INSTALL_DIR}" rev-parse --abbrev-ref HEAD || true)"
    if [[ "${branch}" == "HEAD" || -z "${branch}" ]]; then
      REF="main"
    else
      REF="${branch}"
    fi
  fi

  if git -C "${INSTALL_DIR}" show-ref --verify --quiet "refs/heads/${REF}"; then
    run_git_step "Git checkout failed for ref ${REF}" git -C "${INSTALL_DIR}" checkout "${REF}"
    if git -C "${INSTALL_DIR}" show-ref --verify --quiet "refs/remotes/origin/${REF}"; then
      run_git_step "Git fast-forward failed for ref ${REF}" \
        git -C "${INSTALL_DIR}" merge --ff-only "refs/remotes/origin/${REF}"
    else
      echo "Remote ref origin/${REF} not found after fetch; leaving local branch '${REF}' unchanged."
    fi
  else
    if git -C "${INSTALL_DIR}" show-ref --verify --quiet "refs/remotes/origin/${REF}"; then
      run_git_step "Git detached checkout failed for ref ${REF}" git -C "${INSTALL_DIR}" checkout --detach "origin/${REF}"
    else
      run_git_step "Git detached checkout failed for ref ${REF}" git -C "${INSTALL_DIR}" checkout --detach "${REF}"
    fi
  fi
else
  if [[ -z "${REF}" ]]; then
    echo "Cloning ${REPO_URL} to ${INSTALL_DIR}"
    run_git_step "Git clone failed for ${REPO_URL}" git clone "${REPO_URL}" "${INSTALL_DIR}"
  else
    echo "Cloning ${REPO_URL}@${REF} to ${INSTALL_DIR}"
    run_git_step "Git clone failed for ${REPO_URL}@${REF}" git clone --branch "${REF}" "${REPO_URL}" "${INSTALL_DIR}"
  fi
fi

echo "Installing dependencies..."
pnpm --dir "${INSTALL_DIR}" install --frozen-lockfile
echo "Install note: pnpm version notices and ignored optional build-script warnings are expected on normal Telegram or Discord installs."
echo "If pnpm still reports skipped WhatsApp/media build scripts, approve them before relying on WhatsApp image or document handling."

echo "Building workspace..."
pnpm --dir "${INSTALL_DIR}" -r build

CONFIG_PATH="${HOME}/.config/openassist/openassist.toml"
ENV_FILE="${HOME}/.config/openassist/openassistd.env"
STATE_FILE="${HOME}/.config/openassist/install-state.json"
mkdir -p "$(dirname "${ENV_FILE}")"

if [[ ! -f "${CONFIG_PATH}" ]]; then
  pnpm --dir "${INSTALL_DIR}" --filter @openassist/openassist-cli start -- init --config "${CONFIG_PATH}"
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cat > "${ENV_FILE}" <<'EOF'
# OpenAssist runtime environment
# Provider API keys:
# OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY=replace-me
# OPENASSIST_PROVIDER_ANTHROPIC_MAIN_API_KEY=replace-me
# Optional secret key for encrypted OAuth token storage:
# OPENASSIST_SECRET_KEY=base64:<32-byte-key-base64>
EOF
  chmod 600 "${ENV_FILE}" || true
fi

mkdir -p "${LOCAL_BIN_DIR}"
DEFAULT_INSTALL_DIR_ESCAPED="$(printf '%q' "${INSTALL_DIR}")"

cat > "${LOCAL_BIN_DIR}/openassist" <<EOF
#!/usr/bin/env bash
set -euo pipefail

DEFAULT_INSTALL_DIR=${DEFAULT_INSTALL_DIR_ESCAPED}
INSTALL_DIR="\${OPENASSIST_INSTALL_DIR:-\${DEFAULT_INSTALL_DIR}}"
exec /usr/bin/env node "\${INSTALL_DIR}/apps/openassist-cli/dist/index.js" "\$@"
EOF
chmod 755 "${LOCAL_BIN_DIR}/openassist" || true

cat > "${LOCAL_BIN_DIR}/openassistd" <<EOF
#!/usr/bin/env bash
set -euo pipefail

DEFAULT_INSTALL_DIR=${DEFAULT_INSTALL_DIR_ESCAPED}
INSTALL_DIR="\${OPENASSIST_INSTALL_DIR:-\${DEFAULT_INSTALL_DIR}}"
exec /usr/bin/env node "\${INSTALL_DIR}/apps/openassistd/dist/index.js" "\$@"
EOF
chmod 755 "${LOCAL_BIN_DIR}/openassistd" || true

ensure_local_bin_on_path

GLOBAL_WRAPPERS_INSTALLED=0
if install_global_wrappers_if_possible; then
  GLOBAL_WRAPPERS_INSTALLED=1
fi

SERVICE_KIND="systemd-user"
if [[ "$(uname -s)" == "Darwin" ]]; then
  SERVICE_KIND="launchd"
elif [[ "$(id -u)" -eq 0 ]]; then
  SERVICE_KIND="systemd-system"
fi

if [[ "${INTERACTIVE}" -eq 1 ]]; then
  echo "Running guided lifecycle setup..."
  SETUP_ARGS=(
    "setup"
    "--install-dir" "${INSTALL_DIR}"
    "--config" "${CONFIG_PATH}"
    "--env-file" "${ENV_FILE}"
  )
  if [[ "${SKIP_SERVICE}" -eq 1 ]]; then
    SETUP_ARGS+=("--skip-service")
  fi
  if [[ "${ALLOW_INCOMPLETE}" -eq 1 ]]; then
    SETUP_ARGS+=("--allow-incomplete")
  fi
  "${LOCAL_BIN_DIR}/openassist" "${SETUP_ARGS[@]}"
elif [[ "${SKIP_SERVICE}" -ne 1 ]]; then
  echo "Installing service..."
  pnpm --dir "${INSTALL_DIR}" --filter @openassist/openassist-cli start -- service install \
    --install-dir "${INSTALL_DIR}" \
    --config "${CONFIG_PATH}" \
    --env-file "${ENV_FILE}"
fi

COMMIT="$(git -C "${INSTALL_DIR}" rev-parse HEAD)"
TRACKED_REF="${REF}"
if [[ -z "${TRACKED_REF}" ]]; then
  TRACKED_REF="$(git -C "${INSTALL_DIR}" rev-parse --abbrev-ref HEAD || echo main)"
fi

persist_install_state
print_bootstrap_summary
echo "Resolved tracked ref: ${TRACKED_REF}"
echo "If this shell does not see openassist yet, start a new shell session or source your shell profile."
