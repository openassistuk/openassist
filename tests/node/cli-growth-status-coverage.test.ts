import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { OpenAssistConfig } from "@openassist/config";
import { createLogger } from "../../packages/observability/dist/index.js";
import { OpenAssistDatabase } from "../../packages/storage-sqlite/dist/index.js";
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

describe("local growth status coverage", () => {
  it("returns empty growth state when no skills or helper registry exist yet", async () => {
    const root = tempDir("openassist-growth-empty-");
    const configPath = path.join(root, "openassist.toml");
    const dataDir = path.join(root, "data");
    const skillsDir = path.join(root, "skills");
    const logger = createLogger({ service: "openassist-growth-test" });

    const state = await inspectLocalGrowthState(configPath, minimalConfig(dataDir, skillsDir), logger);

    assert.equal(state.skillsDirectory, skillsDir);
    assert.equal(state.helperToolsDirectory, path.join(dataDir, "helper-tools"));
    assert.deepEqual(state.installedSkills, []);
    assert.deepEqual(state.managedHelpers, []);
    assert.match(state.updateSafetyNote, /runtime-owned paths/i);
  });

  it("filters malformed skill manifests and lists managed helpers from the runtime db", async () => {
    const root = tempDir("openassist-growth-populated-");
    const configPath = path.join(root, "openassist.toml");
    const dataDir = path.join(root, "data");
    const skillsDir = path.join(root, "skills");
    const logger = createLogger({ service: "openassist-growth-test" });

    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(path.join(skillsDir, "no-manifest"), { recursive: true });
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

    const dbPath = path.join(dataDir, "openassist.db");
    const db = new OpenAssistDatabase({ dbPath, logger });
    try {
      db.upsertManagedCapability({
        kind: "helper-tool",
        id: "imagemagick",
        installRoot: path.join(dataDir, "helper-tools", "imagemagick"),
        installer: "apt",
        summary: "Image processing helper",
        updateSafe: true
      });
    } finally {
      db.close();
    }

    const state = await inspectLocalGrowthState(configPath, minimalConfig(dataDir, skillsDir), logger);

    assert.deepEqual(
      state.installedSkills.map((item) => item.id),
      ["alpha-skill", "beta-skill"]
    );
    assert.equal(state.managedHelpers.length, 1);
    assert.equal(state.managedHelpers[0]?.id, "imagemagick");
    assert.equal(state.managedHelpers[0]?.installer, "apt");
    assert.equal(state.managedHelpers[0]?.updateSafe, true);
  });
});
