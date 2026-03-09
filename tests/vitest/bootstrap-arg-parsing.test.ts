import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("bootstrap argument parsing contract", () => {
  it("supports interactive and non-interactive installer modes", () => {
    const scriptPath = path.resolve("scripts/install/bootstrap.sh");
    const script = fs.readFileSync(scriptPath, "utf8");

    expect(script.includes("--interactive")).toBe(true);
    expect(script.includes("--non-interactive")).toBe(true);
    expect(script.includes("--pr <number>")).toBe(true);
    expect(script.includes("--allow-incomplete")).toBe(true);
    expect(script.includes("--auto-install-prereqs")).toBe(true);
    expect(script.includes("--no-auto-install-prereqs")).toBe(true);
    expect(script.includes("[[ -t 0 && -t 1 ]]")).toBe(true);
    expect(script.includes("exec </dev/tty")).toBe(true);
    expect(script.includes("OPENASSIST_DEFAULT_REPO_URL")).toBe(true);
    expect(script.includes("Missing prerequisites detected:")).toBe(true);
    expect(script.includes("Attempting prerequisite installation using")).toBe(true);
    expect(script.includes('PINNED_PNPM_VERSION="10.31.0"')).toBe(true);
    expect(script.includes('corepack prepare "pnpm@${PINNED_PNPM_VERSION}" --activate')).toBe(true);
    expect(script.includes("run_git_step")).toBe(true);
    expect(script.includes("requested_track_ref")).toBe(true);
    expect(script.includes("requested_track_label")).toBe(true);
    expect(script.includes("checkout_requested_track")).toBe(true);
    expect(script.includes("remote_branch_exists")).toBe(true);
    expect(script.includes("checkout_remote_branch")).toBe(true);
    expect(script.includes("git clone \"${REPO_URL}\" \"${INSTALL_DIR}\"")).toBe(true);
    expect(script.includes("git clone --branch")).toBe(false);
    expect(script.includes("Cannot use --ref and --pr together.")).toBe(true);
    expect(script.includes("Git fast-forward failed for ref")).toBe(true);
    expect(script.includes("merge --ff-only \"refs/remotes/origin/${REF}\"")).toBe(true);
    expect(script.includes("pull --ff-only origin \"${REF}\"")).toBe(false);
    expect(script.includes("Clear cached GitHub HTTPS credentials and retry")).toBe(true);
    expect(script.includes("GitHub HTTPS authentication fails")).toBe(true);
    expect(script.includes("Running guided lifecycle setup")).toBe(true);
    expect(script.includes("\"${LOCAL_BIN_DIR}/openassist\" \"${SETUP_ARGS[@]}\"")).toBe(true);
    expect(script.includes('if [[ "${INTERACTIVE}" -ne 1 && ! -f "${CONFIG_PATH}" ]]')).toBe(true);
    expect(script.includes('node "${INSTALL_DIR}/apps/openassist-cli/dist/index.js" init --config "${CONFIG_PATH}"')).toBe(true);
    expect(script.includes('pnpm --dir "${INSTALL_DIR}" --filter @openassist/openassist-cli start -- init --config "${CONFIG_PATH}"')).toBe(false);
    expect(script.includes("Guided onboarding was not run because bootstrap stayed non-interactive. Next step: ${setupCommand}")).toBe(true);
    expect(
      script.includes(
        "const setupCommand = `openassist setup --install-dir ${quoteArg(process.env.OPENASSIST_INSTALL_DIR)} --config ${quoteArg(process.env.OPENASSIST_CONFIG_PATH)} --env-file ${quoteArg(process.env.OPENASSIST_ENV_FILE)}`;"
      )
    ).toBe(true);
    expect(
      script.includes('openassist setup --install-dir \\"${INSTALL_DIR}\\" --config \\"${CONFIG_PATH}\\" --env-file \\"${ENV_FILE}\\"')
    ).toBe(true);
  });
});
