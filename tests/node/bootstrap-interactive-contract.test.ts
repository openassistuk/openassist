import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("bootstrap interactive contract", () => {
  it("supports interactive quickstart path while preserving non-interactive default", () => {
    const scriptPath = path.resolve("scripts/install/bootstrap.sh");
    const script = fs.readFileSync(scriptPath, "utf8");

    assert.match(script, /--interactive/);
    assert.match(script, /--non-interactive/);
    assert.match(script, /--allow-incomplete/);
    assert.match(script, /--auto-install-prereqs/);
    assert.match(script, /--no-auto-install-prereqs/);
    assert.match(script, /\[\[ -t 0 && -t 1 \]\]/);
    assert.match(script, /exec <\/dev\/tty/);
    assert.match(script, /OpenAssist lifecycle plan/);
    assert.match(script, /install model: repo-backed checkout/);
    assert.match(script, /bootstrap mode: \$\(bootstrap_mode\)/);
    assert.match(script, /quickstart after build: \$\{quickstart_mode\}/);
    assert.match(script, /service install\/restart: \$\{service_mode\}/);
    assert.match(script, /persist_install_state/);
    assert.match(script, /OPENASSIST_DEFAULT_REPO_URL/);
    assert.match(script, /Missing prerequisites detected:/);
    assert.match(script, /Attempting prerequisite installation using/);
    assert.match(script, /Troubleshooting guidance:/);
    assert.match(script, /Choose next step for prerequisite recovery/);
    assert.match(script, /Retry automatic installation/);
    assert.match(script, /Exit and fix manually/);
    assert.match(script, /deb\.nodesource\.com\/setup_22\.x/);
    assert.match(script, /Node\.js is still <22 after package install; attempting fallback install via npm\+n/);
    assert.match(script, /npm install -g n/);
    assert.match(script, /n 22/);
    assert.match(script, /PINNED_PNPM_VERSION="10.31.0"/);
    assert.match(script, /corepack prepare "pnpm@\$\{PINNED_PNPM_VERSION\}" --activate/);
    assert.match(script, /run_git_step/);
    assert.match(script, /Git fast-forward failed for ref/);
    assert.match(script, /merge --ff-only "refs\/remotes\/origin\/\$\{REF\}"/);
    assert.doesNotMatch(script, /pull --ff-only origin "\$\{REF\}"/);
    assert.match(script, /Choose next step for repository authentication recovery/);
    assert.match(script, /Clear cached GitHub HTTPS credentials and retry/);
    assert.match(script, /GitHub HTTPS authentication fails/);
    assert.match(script, /Running guided lifecycle setup/);
    assert.match(script, /"setup"/);
    assert.match(script, /if \[\[ "\$\{INTERACTIVE\}" -ne 1 && ! -f "\$\{CONFIG_PATH\}" \]\]/);
    assert.match(script, /node "\$\{INSTALL_DIR\}\/apps\/openassist-cli\/dist\/index\.js" init --config "\$\{CONFIG_PATH\}"/);
    assert.doesNotMatch(script, /pnpm --dir "\$\{INSTALL_DIR\}" --filter @openassist\/openassist-cli start -- init --config "\$\{CONFIG_PATH\}"/);
    assert.match(script, /ensure_local_bin_on_path/);
    assert.match(script, /install_global_wrappers_if_possible/);
    assert.match(script, /GLOBAL_BIN_DIR="\$\{OPENASSIST_GLOBAL_BIN_DIR:-\/usr\/local\/bin\}"/);
    assert.match(script, /append_path_snippet/);
    assert.match(script, /# >>> openassist path >>>/);
    assert.match(script, /PATH profile updated for OpenAssist wrappers:/);
    assert.match(script, /doctor --json/);
    assert.match(script, /bootstrap could not parse doctor --json output/);
    assert.match(script, /Bootstrap complete\./);
    assert.match(script, /Ready now/);
    assert.match(script, /Needs action/);
    assert.match(script, /Next command/);
    assert.match(script, /pins a tested pnpm release for consistent installs/);
    assert.match(script, /Approve skipped WhatsApp\/media build scripts only before using WhatsApp image or document features/);
    assert.match(
      script,
      /Guided onboarding was not run because bootstrap stayed non-interactive\. Next step: \$\{setupCommand\}/
    );
    assert.match(
      script,
      /openassist setup --install-dir \\"\$\{INSTALL_DIR\}\\" --config \\"\$\{CONFIG_PATH\}\\" --env-file \\"\$\{ENV_FILE\}\\"/
    );
    assert.match(script, /Service install and health checks were skipped/);
    assert.match(script, /This shell may need a new login shell before 'openassist' is on PATH\./);
    assert.match(script, /elif \[\[ "\$\{SKIP_SERVICE\}" -ne 1 \]\]/);
    assert.match(script, /SERVICE_KIND="systemd-system"/);
  });
});
