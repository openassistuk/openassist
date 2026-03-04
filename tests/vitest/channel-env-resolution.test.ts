import { describe, expect, it } from "vitest";
import { resolveChannelSettings } from "../../apps/openassistd/src/channel-settings.js";

describe("channel env reference resolution", () => {
  it("resolves env: references in channel settings", () => {
    process.env.OPENASSIST_TEST_BOT_TOKEN = "secret-token";
    const settings = resolveChannelSettings({
      botToken: "env:OPENASSIST_TEST_BOT_TOKEN",
      allowedChatIds: ["1", "2"],
      enabled: true
    });

    expect(settings.botToken).toBe("secret-token");
    expect(settings.allowedChatIds).toEqual(["1", "2"]);
    expect(settings.enabled).toBe(true);
  });
});
