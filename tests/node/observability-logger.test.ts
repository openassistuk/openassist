import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

test("the real logger preserves JSON bindings and redacts configured credential paths", () => {
  const loggerModule = pathToFileURL(path.resolve("packages/observability/dist/index.js")).href;
  const canary = "logger-redaction-canary";
  const script = `
    import { createLogger } from ${JSON.stringify(loggerModule)};
    const logger = createLogger({ service: "logger-contract", level: "info" });
    logger.child({ 'label"quoted': "retained" }).info({
      nested: { apiKey: ${JSON.stringify(canary)}, accessToken: ${JSON.stringify(canary)}, refreshToken: ${JSON.stringify(canary)} },
      req: { headers: { authorization: ${JSON.stringify(canary)} } },
      config: { providers: [{ apiKey: ${JSON.stringify(canary)} }] }
    }, "logger contract");
    await new Promise((resolve, reject) => logger.flush(error => error ? reject(error) : resolve()));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 10_000,
    shell: false
  });
  const rows = output.trim().split(/\r?\n/).map(line => JSON.parse(line));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['label"quoted'], "retained");
  assert.equal(rows[0].msg, "logger contract");
  assert.equal(rows[0].nested.apiKey, "[REDACTED]");
  assert.equal(rows[0].nested.accessToken, "[REDACTED]");
  assert.equal(rows[0].nested.refreshToken, "[REDACTED]");
  assert.equal(rows[0].req.headers.authorization, "[REDACTED]");
  assert.equal(rows[0].config.providers[0].apiKey, "[REDACTED]");
  assert.ok(!output.includes(canary), "Logger output contains an unredacted test credential");
});
