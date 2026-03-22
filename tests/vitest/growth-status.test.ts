import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenAssistConfig } from "@openassist/config";
import { createLogger } from "../../packages/observability/src/index.js";
import { inspectLocalGrowthState } from "../../apps/openassist-cli/src/lib/growth-status.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function minimalConfig(dataDir: string, skillsDir: string): OpenAssistConfig {
  return {
    runtime: {
      bindAddress: "127.0.0.1",
      bindPort: 3344,
      timezone: "Europe/London",
      timezoneConfirmed: true,
      ntpPolicy: "warn-degrade",
      defaultProviderId: "openai-main",
      defaultPolicyProfile: "operator",
      operatorAccessProfile: "operator",
      providers: [],
      channels: [],
      assistant: {
        name: "OpenAssist",
        persona: "Pragmatic",
        operatorPreferences: "",
        promptOnFirstContact: false
      },
      memory: {
        enabled: true
      },
      scheduler: {
        enabled: true,
        tickSeconds: 60,
        maxCatchUpRuns: 10,
        taskTimeoutSeconds: 120
      },
      tools: {
        exec: { enabled: true, blockedCommands: [] },
        fs: { enabled: true, workspaceOnly: true },
        pkg: { enabled: true },
        web: { enabled: true, maxResults: 5, maxPages: 5, maxBytesPerPage: 100000, maxRedirects: 5 }
      },
      secrets: {
        backend: "encrypted-file"
      },
      paths: {
        dataDir,
        logsDir: path.join(path.dirname(dataDir), "logs"),
        skillsDir
      },
      attachments: {
        maxFilesPerMessage: 3,
        maxImageBytes: 2_000_000,
        maxDocumentBytes: 1_000_000,
        maxExtractedChars: 4000
      }
    }
  };
}

describe("growth status", () => {
  it("returns empty state when no skills or helper registry exist yet", async () => {
    const root = tempDir("openassist-growth-empty-");
    const configPath = path.join(root, "openassist.toml");
    const dataDir = path.join(root, "data");
    const skillsDir = path.join(root, "skills");
    const logger = createLogger({ service: "openassist-growth-test" });

    const state = await inspectLocalGrowthState(configPath, minimalConfig(dataDir, skillsDir), logger);

    expect(state.skillsDirectory).toBe(skillsDir);
    expect(state.helperToolsDirectory).toBe(path.join(dataDir, "helper-tools"));
    expect(state.installedSkills).toEqual([]);
    expect(state.managedHelpers).toEqual([]);
    expect(state.updateSafetyNote).toMatch(/runtime-owned paths/i);
  });

  it("filters malformed manifests while leaving helpers empty when no runtime db exists", async () => {
    const root = tempDir("openassist-growth-populated-");
    const configPath = path.join(root, "openassist.toml");
    const dataDir = path.join(root, "data");
    const skillsDir = path.join(root, "skills");
    const logger = createLogger({ service: "openassist-growth-test" });

    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(path.join(skillsDir, "broken"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "broken", "openassist.skill.json"), "{not-json", "utf8");
    fs.mkdirSync(path.join(skillsDir, "missing-fields"), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, "missing-fields", "openassist.skill.json"),
      JSON.stringify({ id: "missing-fields", version: "1.0.0" }),
      "utf8"
    );
    fs.mkdirSync(path.join(skillsDir, "beta-skill"), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, "beta-skill", "openassist.skill.json"),
      JSON.stringify({ id: "beta-skill", version: "2.0.0", description: "Beta skill" }),
      "utf8"
    );
    fs.mkdirSync(path.join(skillsDir, "alpha-skill"), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, "alpha-skill", "openassist.skill.json"),
      JSON.stringify({ id: "alpha-skill", version: "1.0.0", description: "Alpha skill" }),
      "utf8"
    );

    const state = await inspectLocalGrowthState(configPath, minimalConfig(dataDir, skillsDir), logger);

    expect(state.installedSkills.map((item) => item.id)).toEqual(["alpha-skill", "beta-skill"]);
    expect(state.managedHelpers).toEqual([]);
  });

  it("resolves relative runtime paths from the config location", async () => {
    const root = tempDir("openassist-growth-relative-");
    const configPath = path.join(root, "state", "openassist.toml");
    const logger = createLogger({ service: "openassist-growth-test" });

    const state = await inspectLocalGrowthState(
      configPath,
      minimalConfig("data", "skills"),
      logger
    );

    expect(state.skillsDirectory).toBe(path.join(root, "state", "skills"));
    expect(state.helperToolsDirectory).toBe(path.join(root, "state", "data", "helper-tools"));
  });

  it("accepts absolute runtime paths and ignores non-directory or manifest-less skill entries", async () => {
    const root = tempDir("openassist-growth-absolute-");
    const configPath = path.join(root, "configs", "openassist.toml");
    const dataDir = path.join(root, "runtime-data");
    const skillsDir = path.join(root, "runtime-skills");
    const logger = createLogger({ service: "openassist-growth-test" });

    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "README.txt"), "not-a-directory", "utf8");
    fs.mkdirSync(path.join(skillsDir, "missing-manifest"), { recursive: true });

    const state = await inspectLocalGrowthState(configPath, minimalConfig(dataDir, skillsDir), logger);

    expect(state.skillsDirectory).toBe(skillsDir);
    expect(state.helperToolsDirectory).toBe(path.join(dataDir, "helper-tools"));
    expect(state.installedSkills).toEqual([]);
    expect(state.managedHelpers).toEqual([]);
  });
});
