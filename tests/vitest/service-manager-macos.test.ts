import { describe, expect, it } from "vitest";
import {
  renderLaunchdPlist,
  renderLaunchdWrapper
} from "../../apps/openassist-cli/src/lib/service-manager.js";

describe("service-manager macOS rendering", () => {
  it("renders launchd wrapper with env sourcing", () => {
    const wrapper = renderLaunchdWrapper({
      installDir: "/Users/test/openassist",
      configPath: "/Users/test/openassist/openassist.toml",
      envFilePath: "/Users/test/.config/openassist/openassistd.env",
      nodeBin: "/opt/homebrew/bin/node"
    });

    expect(wrapper).toContain("source '/Users/test/.config/openassist/openassistd.env'");
    expect(wrapper).toContain("export OPENASSIST_ENV_FILE='/Users/test/.config/openassist/openassistd.env'");
    expect(wrapper).toContain("apps/openassistd/dist/index.js");
    expect(wrapper).toContain("--config '/Users/test/openassist/openassist.toml'");
    expect(wrapper).toContain("/opt/homebrew/bin/node");
  });

  it("renders launchd plist placeholders", () => {
    const template = [
      "<string>__OPENASSIST_REPO__</string>",
      "<string>__OPENASSIST_WRAPPER__</string>",
      "<string>__OPENASSIST_STDOUT__</string>",
      "<string>__OPENASSIST_STDERR__</string>"
    ].join("\n");

    const rendered = renderLaunchdPlist(template, {
      installDir: "/Users/test/openassist",
      wrapperPath: "/Users/test/.config/openassist/openassistd-launchd-wrapper.sh",
      stdoutLogPath: "/Users/test/Library/Logs/OpenAssist/openassistd.out.log",
      stderrLogPath: "/Users/test/Library/Logs/OpenAssist/openassistd.err.log"
    });

    expect(rendered).toContain("/Users/test/openassist");
    expect(rendered).toContain("/Users/test/.config/openassist/openassistd-launchd-wrapper.sh");
    expect(rendered).toContain("/Users/test/Library/Logs/OpenAssist/openassistd.out.log");
    expect(rendered).toContain("/Users/test/Library/Logs/OpenAssist/openassistd.err.log");
  });
});
