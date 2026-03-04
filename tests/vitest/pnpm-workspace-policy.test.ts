import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("pnpm workspace build-script policy", () => {
  it("declares onlyBuiltDependencies for required postinstall packages", () => {
    const workspacePath = path.resolve("pnpm-workspace.yaml");
    const raw = fs.readFileSync(workspacePath, "utf8");

    expect(raw).toMatch(/onlyBuiltDependencies:/);
    expect(raw).toMatch(/- esbuild/);
    expect(raw).toMatch(/- protobufjs/);
  });
});
