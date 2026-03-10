import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

describe("bootstrap installer idempotence contract", () => {
  it("contains update-in-place and dirty-worktree guard logic", () => {
    const scriptPath = path.resolve("scripts/install/bootstrap.sh");
    assert.equal(fs.existsSync(scriptPath), true);
    const script = fs.readFileSync(scriptPath, "utf8");

    assert.ok(script.includes("Existing install detected"));
    assert.ok(script.includes("--allow-dirty"));
    assert.ok(script.includes("--pr <number>"));
    assert.ok(script.includes("--interactive"));
    assert.ok(script.includes("--non-interactive"));
    assert.ok(script.includes("--allow-incomplete"));
    assert.ok(script.includes("--auto-install-prereqs"));
    assert.ok(script.includes("--no-auto-install-prereqs"));
    assert.ok(script.includes("[[ -t 0 && -t 1 ]]"));
    assert.ok(script.includes("exec </dev/tty"));
    assert.ok(script.includes("OpenAssist lifecycle plan"));
    assert.ok(script.includes("install model: repo-backed checkout"));
    assert.ok(script.includes("requested track: $(requested_track_label)"));
    assert.ok(script.includes("quickstart after build: ${quickstart_mode}"));
    assert.ok(script.includes("service install/restart: ${service_mode}"));
    assert.ok(script.includes("persist_install_state"));
    assert.ok(script.includes("OPENASSIST_DEFAULT_REPO_URL"));
    assert.ok(script.includes("Missing prerequisites detected:"));
    assert.ok(script.includes("Attempting prerequisite installation using"));
    assert.ok(script.includes("Troubleshooting guidance:"));
    assert.ok(script.includes("Choose next step for prerequisite recovery"));
    assert.ok(script.includes("Retry automatic installation"));
    assert.ok(script.includes("Exit and fix manually"));
    assert.ok(script.includes("deb.nodesource.com/setup_22.x"));
    assert.ok(script.includes("Node.js is still <22 after package install; attempting fallback install via npm+n"));
    assert.ok(script.includes("npm install -g n"));
    assert.ok(script.includes("n 22"));
    assert.ok(script.includes('PINNED_PNPM_VERSION="10.31.0"'));
    assert.ok(script.includes('corepack prepare "pnpm@${PINNED_PNPM_VERSION}" --activate'));
    assert.ok(script.includes("git -C \"${INSTALL_DIR}\" status --porcelain"));
    assert.ok(script.includes("requested_track_ref"));
    assert.ok(script.includes("requested_track_label"));
    assert.ok(script.includes("checkout_requested_track"));
    assert.ok(script.includes("remote_branch_exists"));
    assert.ok(script.includes("checkout_remote_branch"));
    assert.ok(script.includes('show-ref --verify --quiet "refs/remotes/origin/${branch_name}"'));
    assert.ok(!script.includes("ls-remote --exit-code --heads origin"));
    assert.ok(script.includes("refs/pull/${PR_NUMBER}/head"));
    assert.ok(script.includes("git clone \"${REPO_URL}\" \"${INSTALL_DIR}\""));
    assert.ok(!script.includes("git clone --branch"));
    assert.ok(script.includes("Git fast-forward failed for ref"));
    assert.ok(script.includes("merge --ff-only \"refs/remotes/origin/${REF}\""));
    assert.ok(!script.includes("pull --ff-only origin \"${REF}\""));
    assert.ok(script.includes("pnpm --dir \"${INSTALL_DIR}\" install --frozen-lockfile"));
    assert.ok(script.includes("Running guided lifecycle setup"));
    assert.ok(script.includes('if [[ "${INTERACTIVE}" -ne 1 && ! -f "${CONFIG_PATH}" ]]'));
    assert.ok(script.includes('node "${INSTALL_DIR}/apps/openassist-cli/dist/index.js" init --config "${CONFIG_PATH}"'));
    assert.ok(!script.includes('pnpm --dir "${INSTALL_DIR}" --filter @openassist/openassist-cli start -- init --config "${CONFIG_PATH}"'));
    assert.ok(script.includes("LOCAL_BIN_DIR=\"${HOME}/.local/bin\""));
    assert.ok(script.includes("GLOBAL_BIN_DIR=\"${OPENASSIST_GLOBAL_BIN_DIR:-/usr/local/bin}\""));
    assert.ok(script.includes("ensure_local_bin_on_path"));
    assert.ok(script.includes("install_global_wrappers_if_possible"));
    assert.ok(script.includes("GLOBAL_WRAPPERS_INSTALLED=0"));
    assert.ok(script.includes("append_path_snippet"));
    assert.ok(script.includes("# >>> openassist path >>>"));
    assert.ok(script.includes("PATH profile updated for OpenAssist wrappers:"));
    assert.ok(script.includes("doctor --json"));
    assert.ok(script.includes("bootstrap could not parse doctor --json output"));
    assert.ok(script.includes("Bootstrap complete."));
    assert.ok(script.includes("Ready now"));
    assert.ok(script.includes("Needs action"));
    assert.ok(script.includes("Next command"));
    assert.ok(script.includes("pins a tested pnpm release for consistent installs"));
    assert.ok(script.includes("Approve skipped WhatsApp/media build scripts only before using WhatsApp image or document features."));
    assert.ok(script.includes("Guided onboarding was not run because bootstrap stayed non-interactive. Next step: ${setupCommand}"));
    assert.ok(
      script.includes(
        "const setupCommand = `openassist setup --install-dir ${quoteArg(process.env.OPENASSIST_INSTALL_DIR)} --config ${quoteArg(process.env.OPENASSIST_CONFIG_PATH)} --env-file ${quoteArg(process.env.OPENASSIST_ENV_FILE)}`;"
      )
    );
    assert.ok(
      script.includes('openassist setup --install-dir \\"${INSTALL_DIR}\\" --config \\"${CONFIG_PATH}\\" --env-file \\"${ENV_FILE}\\"')
    );
    assert.ok(script.includes("Service install and health checks were skipped."));
    assert.ok(script.includes("This shell may need a new login shell before 'openassist' is on PATH."));
    assert.ok(script.includes("SERVICE_KIND=\"systemd-system\""));
    assert.ok(script.includes("Cannot use --ref and --pr together."));
    assert.ok(script.includes('if [[ "${TRACKED_REF}" == "HEAD" ]]; then'));
    assert.ok(script.includes('TRACKED_REF="main"'));
  });

  it("parses as valid bash syntax", () => {
    const result = spawnSync("bash", ["-n", "scripts/install/bootstrap.sh"], {
      cwd: path.resolve("."),
      encoding: "utf8"
    });

    if (result.error && "code" in result.error && result.error.code === "ENOENT") {
      return;
    }

    assert.equal(
      result.status,
      0,
      `bootstrap.sh failed bash -n:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  });
});
