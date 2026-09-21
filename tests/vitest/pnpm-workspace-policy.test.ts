import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("pnpm workspace build-script policy", () => {
  it("declares allowBuilds for required postinstall packages", () => {
    const workspacePath = path.resolve("pnpm-workspace.yaml");
    const raw = fs.readFileSync(workspacePath, "utf8");

    expect(raw).toMatch(/allowBuilds:/);
    expect(raw).toMatch(/esbuild: true/);
    expect(raw).toMatch(/protobufjs: true/);
  });
});
