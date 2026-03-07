import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRuntimeAwarenessSnapshot,
  buildRuntimeAwarenessSystemMessage,
  getRuntimeSelfKnowledgeDocs
} from "../../packages/core-runtime/src/index.js";

function buildWebStatus(
  overrides: Partial<{
    enabled: boolean;
    searchMode: "hybrid" | "api-only" | "fallback-only";
    braveApiConfigured: boolean;
    fallbackEnabled: boolean;
    searchStatus: "disabled" | "available" | "fallback" | "unavailable";
    requestTimeoutMs: number;
    maxRedirects: number;
    maxFetchBytes: number;
    maxSearchResults: number;
    maxPagesPerRun: number;
  }> = {}
) {
  return {
    enabled: true,
    searchMode: "hybrid" as const,
    braveApiConfigured: true,
    fallbackEnabled: true,
    searchStatus: "available" as const,
    requestTimeoutMs: 15000,
    maxRedirects: 5,
    maxFetchBytes: 1000000,
    maxSearchResults: 8,
    maxPagesPerRun: 4,
    ...overrides
  };
}

describe("runtime self-knowledge", () => {
  it("builds a richer bounded snapshot for full-root sessions with install context", () => {
    const snapshot = buildRuntimeAwarenessSnapshot({
      sessionId: "telegram-main:ops-room",
      conversationKey: "ops-room",
      defaultProviderId: "openai-main",
      providerIds: ["openai-main"],
      channelIds: ["telegram-main"],
      timezone: "Europe/London",
      modules: ["recovery=running", "scheduler=running"],
      host: {
        platform: "linux",
        release: "6.8.0",
        arch: "x64",
        hostname: "ops-box",
        nodeVersion: "v22.16.0",
        workspaceRoot: "/srv/openassist"
      },
      profile: "full-root",
      source: "session-override",
      configuredToolNames: ["exec.run", "fs.read", "fs.write", "web.search", "web.fetch", "web.run"],
      callableToolNames: ["exec.run", "fs.read", "fs.write", "web.search", "web.fetch", "web.run"],
      webStatus: buildWebStatus(),
      workspaceOnly: false,
      allowedWritePaths: [],
      installContext: {
        repoBackedInstall: true,
        installDir: "/srv/openassist",
        configPath: "/srv/openassist/openassist.toml",
        envFilePath: "/home/test/.config/openassist/openassistd.env",
        trackedRef: "main",
        lastKnownGoodCommit: "abc123"
      }
    });

    expect(snapshot.version).toBe(2);
    expect(snapshot.capabilities.canInspectLocalFiles).toBe(true);
    expect(snapshot.capabilities.canRunLocalCommands).toBe(true);
    expect(snapshot.capabilities.canEditConfig).toBe(true);
    expect(snapshot.capabilities.canEditDocs).toBe(true);
    expect(snapshot.capabilities.canEditCode).toBe(true);
    expect(snapshot.capabilities.canControlService).toBe(true);
    expect(snapshot.capabilities.nativeWebAvailable).toBe(true);
    expect(snapshot.documentation.refs.some((entry) => entry.path === "README.md")).toBe(true);
    expect(snapshot.documentation.refs.some((entry) => entry.path === "openassist.toml")).toBe(true);
    expect(snapshot.maintenance.repoBackedInstall).toBe(true);
    expect(snapshot.maintenance.installDir).toBe("/srv/openassist");
    expect(snapshot.maintenance.trackedRef).toBe("main");

    const rendered = buildRuntimeAwarenessSystemMessage(snapshot);
    expect(rendered).toMatch(/OpenAssist runtime self-knowledge/i);
    expect(rendered).toMatch(/docs\/operations\/upgrade-and-rollback\.md/i);
    expect(rendered).toMatch(/config=\/srv\/openassist\/openassist\.toml/i);
    expect(rendered).toMatch(/preferred lifecycle commands/i);
  });

  it("keeps lower-access sessions advisory-only and explains blocked capabilities", () => {
    const snapshot = buildRuntimeAwarenessSnapshot({
      sessionId: "telegram-main:ops-room",
      conversationKey: "ops-room",
      defaultProviderId: "openai-main",
      providerIds: ["openai-main"],
      channelIds: ["telegram-main"],
      timezone: "UTC",
      modules: ["recovery=running"],
      host: {
        platform: "linux",
        release: "6.8.0",
        arch: "x64",
        hostname: "ops-box",
        nodeVersion: "v22.16.0",
        workspaceRoot: "/srv/openassist"
      },
      profile: "operator",
      source: "default",
      configuredToolNames: ["exec.run", "fs.read", "fs.write", "web.search", "web.fetch", "web.run"],
      callableToolNames: [],
      webStatus: buildWebStatus({ searchStatus: "fallback" }),
      workspaceOnly: true,
      allowedWritePaths: [],
      installContext: {
        repoBackedInstall: true,
        installDir: "/srv/openassist",
        configPath: "/srv/openassist/openassist.toml"
      }
    });

    expect(snapshot.capabilities.canInspectLocalFiles).toBe(false);
    expect(snapshot.capabilities.canRunLocalCommands).toBe(false);
    expect(snapshot.capabilities.canEditConfig).toBe(false);
    expect(snapshot.capabilities.canEditDocs).toBe(false);
    expect(snapshot.capabilities.canEditCode).toBe(false);
    expect(snapshot.capabilities.canControlService).toBe(false);
    expect(snapshot.capabilities.nativeWebAvailable).toBe(false);
    expect(snapshot.capabilities.blockedReasons.join(" ")).toMatch(/advisory-only/i);
    expect(snapshot.maintenance.safeEditRules[0]).toMatch(/diagnose and advise/i);
  });

  it("keeps curated doc references aligned with real repo files", () => {
    const repoRoot = process.cwd();
    for (const ref of getRuntimeSelfKnowledgeDocs()) {
      expect(fs.existsSync(path.join(repoRoot, ref.path))).toBe(true);
      expect(ref.purpose.length).toBeGreaterThan(10);
      expect(ref.whenToUse.length).toBeGreaterThan(10);
    }
  });
});
