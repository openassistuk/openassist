import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SpawnCommandRunner,
  runOrThrow,
  runStreamingOrThrow
} from "../../apps/openassist-cli/src/lib/command-runner.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("command-runner", () => {
  it("captures stdout/stderr and exit code", async () => {
    const root = tempDir("openassist-command-runner-");
    const scriptPath = path.join(root, "ok.js");
    fs.writeFileSync(scriptPath, "process.stdout.write('ok'); process.stderr.write('warn');", "utf8");

    const runner = new SpawnCommandRunner();
    const result = await runner.run("node", [scriptPath]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ok");
    expect(result.stderr).toContain("warn");
  });

  it("throws on non-zero exit in runOrThrow", async () => {
    const root = tempDir("openassist-command-runner-fail-");
    const scriptPath = path.join(root, "fail.js");
    fs.writeFileSync(scriptPath, "process.stderr.write('boom'); process.exit(7);", "utf8");

    const runner = new SpawnCommandRunner();

    await expect(runOrThrow(runner, "node", [scriptPath])).rejects.toThrow("Command failed: node");
  });

  it("throws on non-zero exit in runStreamingOrThrow", async () => {
    const root = tempDir("openassist-command-runner-stream-fail-");
    const scriptPath = path.join(root, "fail-stream.js");
    fs.writeFileSync(scriptPath, "process.exit(5);", "utf8");

    const runner = new SpawnCommandRunner();

    await expect(runStreamingOrThrow(runner, "node", [scriptPath])).rejects.toThrow("Command failed: node");
  });
});
