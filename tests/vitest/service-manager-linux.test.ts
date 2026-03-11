import { describe, expect, it } from "vitest";
import { renderSystemdUnit } from "../../apps/openassist-cli/src/lib/service-manager.js";

describe("service-manager linux rendering", () => {
  it("renders hardened systemd unit placeholders", () => {
    const template = [
      "WorkingDirectory=__OPENASSIST_INSTALL_DIR__",
      "EnvironmentFile=__OPENASSIST_ENV_FILE__",
      "Environment=OPENASSIST_ENV_FILE=__OPENASSIST_ENV_FILE__",
      "Environment=OPENASSIST_SERVICE_MANAGER_KIND=__OPENASSIST_SERVICE_MANAGER_KIND__",
      "Environment=OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS=__OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS__",
      "ExecStart=__OPENASSIST_NODE_BIN__ ... --config __OPENASSIST_CONFIG_PATH__",
      "__OPENASSIST_SYSTEMD_HARDENING__"
    ].join("\n");

    const rendered = renderSystemdUnit(template, {
      installDir: "/home/test/openassist",
      configPath: "/home/test/openassist/openassist.toml",
      envFilePath: "/home/test/.config/openassist/openassistd.env",
      nodeBin: "/usr/local/bin/node",
      serviceManagerKind: "systemd-user",
      systemdFilesystemAccess: "hardened"
    });

    expect(rendered).toContain("WorkingDirectory=/home/test/openassist");
    expect(rendered).toContain("EnvironmentFile=/home/test/.config/openassist/openassistd.env");
    expect(rendered).toContain("Environment=OPENASSIST_ENV_FILE=/home/test/.config/openassist/openassistd.env");
    expect(rendered).toContain("Environment=OPENASSIST_SERVICE_MANAGER_KIND=systemd-user");
    expect(rendered).toContain("Environment=OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS=hardened");
    expect(rendered).toContain("--config /home/test/openassist/openassist.toml");
    expect(rendered).toContain("ProtectSystem=strict");
    expect(rendered).toContain(
      "ReadWritePaths=/home/test/openassist /home/test/.config/openassist %h/.local/state/openassist"
    );
    expect(rendered).toContain("/usr/local/bin/node");
  });

  it("omits Linux systemd sandbox lines in unrestricted mode", () => {
    const rendered = renderSystemdUnit("__OPENASSIST_SYSTEMD_HARDENING__", {
      installDir: "/home/test/openassist",
      configPath: "/home/test/openassist/openassist.toml",
      envFilePath: "/home/test/.config/openassist/openassistd.env",
      nodeBin: "/usr/local/bin/node",
      serviceManagerKind: "systemd-system",
      systemdFilesystemAccess: "unrestricted"
    });

    expect(rendered.trim()).toBe("");
  });
});
