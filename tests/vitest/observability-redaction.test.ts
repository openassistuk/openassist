import { describe, expect, it } from "vitest";
import { redactSensitiveData } from "../../packages/observability/src/index.js";

describe("observability redaction", () => {
  it("redacts sensitive key names and env values", () => {
    const input = {
      apiKey: "sk-test-long-key-value",
      nested: {
        accessToken: "token-123",
        env: {
          PATH: "/usr/bin",
          OPENASSIST_SECRET: "secret"
        }
      }
    };

    const redacted = redactSensitiveData(input);
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.nested.accessToken).toBe("[REDACTED]");
    expect(redacted.nested.env.PATH).toBe("[REDACTED]");
    expect(redacted.nested.env.OPENASSIST_SECRET).toBe("[REDACTED]");
  });

  it("redacts token-like freeform strings", () => {
    const redacted = redactSensitiveData({
      stdout: "prefix sk-test-long-key-value suffix",
      stderr: "ok"
    });

    expect(redacted.stdout).toBe("[REDACTED]");
    expect(redacted.stderr).toBe("ok");
  });
});
