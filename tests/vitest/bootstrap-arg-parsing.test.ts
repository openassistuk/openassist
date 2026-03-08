import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("bootstrap argument parsing contract", () => {
  it("supports interactive and non-interactive installer modes", () => {
    const scriptPath = path.resolve("scripts/install/bootstrap.sh");
    const script = fs.readFileSync(scriptPath, "utf8");

    expect(script.includes("--interactive")).toBe(true);
    expect(script.includes("--non-interactive")).toBe(true);
    expect(script.includes("--allow-incomplete")).toBe(true);
    expect(script.includes("--auto-install-prereqs")).toBe(true);
    expect(script.includes("--no-auto-install-prereqs")).toBe(true);
    expect(script.includes("[[ -t 0 && -t 1 ]]")).toBe(true);
    expect(script.includes("exec </dev/tty")).toBe(true);
    expect(script.includes("OPENASSIST_DEFAULT_REPO_URL")).toBe(true);
    expect(script.includes("Missing prerequisites detected:")).toBe(true);
    expect(script.includes("Attempting prerequisite installation using")).toBe(true);
    expect(script.includes("corepack prepare pnpm@10.26.0 --activate")).toBe(true);
    expect(script.includes("run_git_step")).toBe(true);
    expect(script.includes("Git fast-forward failed for ref")).toBe(true);
    expect(script.includes("merge --ff-only \"refs/remotes/origin/${REF}\"")).toBe(true);
    expect(script.includes("pull --ff-only origin \"${REF}\"")).toBe(false);
    expect(script.includes("Clear cached GitHub HTTPS credentials and retry")).toBe(true);
    expect(script.includes("GitHub HTTPS authentication fails")).toBe(true);
    expect(script.includes("Running guided lifecycle setup")).toBe(true);
    expect(script.includes("\"${LOCAL_BIN_DIR}/openassist\" \"${SETUP_ARGS[@]}\"")).toBe(true);
    expect(script.includes("Guided onboarding was not run because bootstrap stayed non-interactive. Next step: ${setupCommand}")).toBe(true);
    expect(
      script.includes('openassist setup --install-dir \\"${INSTALL_DIR}\\" --config \\"${CONFIG_PATH}\\" --env-file \\"${ENV_FILE}\\"')
    ).toBe(true);
  });
});
