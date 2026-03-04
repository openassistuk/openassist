import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectServiceManagerKind,
  renderLaunchdPlist,
  renderLaunchdWrapper,
  renderSystemdUnit
} from "../../apps/openassist-cli/src/lib/service-manager.js";

describe("cli service lifecycle helpers", () => {
  it("selects service manager kind for current platform", () => {
    const kind = detectServiceManagerKind();
    assert.ok(kind === "systemd-user" || kind === "systemd-system" || kind === "launchd");
  });

  it("renders systemd and launchd templates for lifecycle operations", () => {
    const systemd = renderSystemdUnit(
      "WorkingDirectory=__OPENASSIST_INSTALL_DIR__\nEnvironmentFile=__OPENASSIST_ENV_FILE__\nExecStart=--config __OPENASSIST_CONFIG_PATH__\nReadWritePaths=__OPENASSIST_RW_CONFIG_DIR__",
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        nodeBin: "/usr/bin/node"
      }
    );
    assert.ok(systemd.includes("WorkingDirectory=/tmp/openassist"));
    assert.ok(systemd.includes("EnvironmentFile=/tmp/openassistd.env"));

    const wrapper = renderLaunchdWrapper({
      installDir: "/tmp/openassist",
      configPath: "/tmp/openassist/openassist.toml",
      envFilePath: "/tmp/openassistd.env",
      nodeBin: "/usr/bin/node"
    });
    assert.ok(wrapper.includes("source '/tmp/openassistd.env'"));

    const plist = renderLaunchdPlist(
      "__OPENASSIST_REPO__|__OPENASSIST_WRAPPER__|__OPENASSIST_STDOUT__|__OPENASSIST_STDERR__",
      {
        installDir: "/tmp/openassist",
        wrapperPath: "/tmp/openassist-wrapper.sh",
        stdoutLogPath: "/tmp/openassist.out.log",
        stderrLogPath: "/tmp/openassist.err.log"
      }
    );
    assert.ok(plist.includes("/tmp/openassist-wrapper.sh"));
  });
});
