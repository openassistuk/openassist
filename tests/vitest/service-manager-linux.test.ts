import { describe, expect, it } from "vitest";
import { renderSystemdUnit } from "../../apps/openassist-cli/src/lib/service-manager.js";

describe("service-manager linux rendering", () => {
  it("renders systemd unit placeholders", () => {
    const template = [
      "WorkingDirectory=__OPENASSIST_INSTALL_DIR__",
      "EnvironmentFile=__OPENASSIST_ENV_FILE__",
      "Environment=OPENASSIST_ENV_FILE=__OPENASSIST_ENV_FILE__",
      "ExecStart=__OPENASSIST_NODE_BIN__ ... --config __OPENASSIST_CONFIG_PATH__",
      "ReadWritePaths=__OPENASSIST_INSTALL_DIR__ __OPENASSIST_RW_CONFIG_DIR__"
    ].join("\n");

    const rendered = renderSystemdUnit(template, {
      installDir: "/home/test/openassist",
      configPath: "/home/test/openassist/openassist.toml",
      envFilePath: "/home/test/.config/openassist/openassistd.env",
      nodeBin: "/usr/local/bin/node"
    });

    expect(rendered).toContain("WorkingDirectory=/home/test/openassist");
    expect(rendered).toContain("EnvironmentFile=/home/test/.config/openassist/openassistd.env");
    expect(rendered).toContain("Environment=OPENASSIST_ENV_FILE=/home/test/.config/openassist/openassistd.env");
    expect(rendered).toContain("--config /home/test/openassist/openassist.toml");
    expect(rendered).toContain("ReadWritePaths=/home/test/openassist /home/test/.config/openassist");
    expect(rendered).toContain("/usr/local/bin/node");
  });
});
