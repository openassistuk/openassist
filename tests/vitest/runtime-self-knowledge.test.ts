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
      activeChannelId: "telegram-main",
      activeChannelType: "telegram",
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
      maxToolRoundsPerTurn: 12,
      configuredToolNames: ["exec.run", "fs.read", "fs.write", "web.search", "web.fetch", "web.run"],
      callableToolNames: ["exec.run", "fs.read", "fs.write", "web.search", "web.fetch", "web.run"],
      providerCapabilities: {
        supportsStreaming: true,
        supportsTools: true,
        supportsOAuth: true,
        supportsApiKeys: true,
        supportsImageInputs: true
      },
      channelCapabilities: {
        supportsEdits: true,
        supportsDeletes: true,
        supportsReadReceipts: false,
        supportsFormattedText: true,
        supportsImageAttachments: true,
        supportsDocumentAttachments: true,
        supportsOutboundImageAttachments: true,
        supportsOutboundDocumentAttachments: true,
        supportsDirectRecipientDelivery: true
      },
      systemdFilesystemAccessConfigured: "hardened",
      delivery: {
        outboundFileRepliesAvailable: true,
        operatorNotifyAvailable: true,
        channelSupportsOutboundFiles: true,
        channelSupportsDirectRecipientDelivery: true,
        notes: ["Generated files can be returned through this chat.", "Targeted operator notifications are limited to approved operators."]
      },
      scheduler: {
        enabled: true,
        running: true,
        taskCount: 3
      },
      growth: {
        installedSkillCount: 2,
        managedHelperCount: 1,
        skillsDirectory: "/srv/openassist/.openassist/skills",
        helperToolsDirectory: "/srv/openassist/.openassist/data/helper-tools"
      },
      webStatus: buildWebStatus(),
      workspaceOnly: false,
      allowedWritePaths: [],
      installContext: {
        repoBackedInstall: true,
        installDir: "/srv/openassist",
        configPath: "/srv/openassist/openassist.toml",
        envFilePath: "/home/test/.config/openassist/openassistd.env",
        trackedRef: "main",
        lastKnownGoodCommit: "abc123",
        serviceManager: "systemd-system",
        systemdFilesystemAccessEffective: "hardened"
      }
    });

    expect(snapshot.version).toBe(6);
    expect(snapshot.service).toMatchObject({
      manager: "systemd-system",
      systemdFilesystemAccessConfigured: "hardened",
      systemdFilesystemAccessEffective: "hardened"
    });
    expect(snapshot.delivery.outboundFileRepliesAvailable).toBe(true);
    expect(snapshot.delivery.operatorNotifyAvailable).toBe(true);
    expect(snapshot.capabilities.canInspectLocalFiles).toBe(true);
    expect(snapshot.capabilities.canRunLocalCommands).toBe(true);
    expect(snapshot.capabilities.canEditConfig).toBe(true);
    expect(snapshot.capabilities.canEditDocs).toBe(true);
    expect(snapshot.capabilities.canEditCode).toBe(true);
    expect(snapshot.capabilities.canControlService).toBe(true);
    expect(snapshot.capabilities.nativeWebAvailable).toBe(true);
    expect(snapshot.documentation.refs.some((entry) => entry.path === "README.md")).toBe(true);
    expect(snapshot.documentation.refs.some((entry) => entry.path === "openassist.toml")).toBe(true);
    expect(snapshot.documentation.refs.some((entry) => entry.path === "docs/interfaces/skills-manifest.md")).toBe(true);
    expect(snapshot.maintenance.repoBackedInstall).toBe(true);
    expect(snapshot.maintenance.installDir).toBe("/srv/openassist");
    expect(snapshot.maintenance.trackedRef).toBe("main");
    expect(snapshot.runtime.activeChannelId).toBe("telegram-main");
    expect(snapshot.runtime.activeChannelType).toBe("telegram");
    expect(snapshot.capabilityDomains.some((domain) => domain.id === "capability-growth")).toBe(true);
    expect(snapshot.growth.defaultMode).toBe("extensions-first");
    expect(snapshot.growth.installedSkillCount).toBe(2);
    expect(snapshot.growth.managedHelperCount).toBe(1);
    expect(snapshot.maintenance.protectedPaths).toContain("<installDir>/.git");
    expect(snapshot.maintenance.protectedPaths.some((entry) => entry.includes("$HOME"))).toBe(true);
    expect(snapshot.maintenance.protectedPaths.some((entry) => entry.includes("systemd"))).toBe(false);
    expect(snapshot.maintenance.protectedSurfaces).toContain(
      "systemd service units and launchd plists managed by lifecycle commands"
    );

    const rendered = buildRuntimeAwarenessSystemMessage(snapshot);
    expect(rendered).toMatch(/OpenAssist runtime self-knowledge/i);
    expect(rendered).toMatch(/docs\/operations\/upgrade-and-rollback\.md/i);
    expect(rendered).toMatch(/docs\/interfaces\/skills-manifest\.md/i);
    expect(rendered).toMatch(/config=\/srv\/openassist\/openassist\.toml/i);
    expect(rendered).toMatch(/activeChannel=telegram-main\/telegram/i);
    expect(rendered).toMatch(/systemdConfigured=hardened/i);
    expect(rendered).toMatch(/maxToolRounds=12/i);
    expect(rendered).toMatch(/capability domains:/i);
    expect(rendered).toMatch(/growth: mode=extensions-first/i);
    expect(rendered).toMatch(/protected surfaces:/i);
    expect(rendered).toMatch(/preferred lifecycle commands/i);
  });

  it("keeps lower-access sessions advisory-only and explains blocked capabilities", () => {
    const snapshot = buildRuntimeAwarenessSnapshot({
      sessionId: "telegram-main:ops-room",
      conversationKey: "ops-room",
      defaultProviderId: "openai-main",
      activeChannelId: "telegram-main",
      activeChannelType: "telegram",
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
      maxToolRoundsPerTurn: 12,
      configuredToolNames: ["exec.run", "fs.read", "fs.write", "web.search", "web.fetch", "web.run"],
      callableToolNames: [],
      providerCapabilities: {
        supportsStreaming: true,
        supportsTools: true,
        supportsOAuth: true,
        supportsApiKeys: true,
        supportsImageInputs: false
      },
      channelCapabilities: {
        supportsEdits: true,
        supportsDeletes: true,
        supportsReadReceipts: false,
        supportsFormattedText: true,
        supportsImageAttachments: true,
        supportsDocumentAttachments: true,
        supportsOutboundImageAttachments: true,
        supportsOutboundDocumentAttachments: true,
        supportsDirectRecipientDelivery: true
      },
      systemdFilesystemAccessConfigured: "hardened",
      delivery: {
        outboundFileRepliesAvailable: false,
        operatorNotifyAvailable: false,
        channelSupportsOutboundFiles: true,
        channelSupportsDirectRecipientDelivery: true,
        notes: ["Outbound file replies require a full-root session.", "Targeted operator notifications require a full-root session."]
      },
      scheduler: {
        enabled: true,
        running: false,
        blockedReason: "timezone confirmation required",
        taskCount: 2
      },
      growth: {
        installedSkillCount: 0,
        managedHelperCount: 0,
        skillsDirectory: "/srv/openassist/.openassist/skills",
        helperToolsDirectory: "/srv/openassist/.openassist/data/helper-tools"
      },
      webStatus: buildWebStatus({ searchStatus: "fallback" }),
      workspaceOnly: true,
      allowedWritePaths: [],
      installContext: {
        repoBackedInstall: true,
        installDir: "/srv/openassist",
        configPath: "/srv/openassist/openassist.toml",
        serviceManager: "systemd-user",
        systemdFilesystemAccessEffective: "hardened"
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
    expect(snapshot.service.notes.join(" ")).toMatch(/package installs, sudo, and broader host writes may still be blocked/i);
    expect(snapshot.maintenance.safeEditRules[0]).toMatch(/diagnose and advise/i);
    expect(snapshot.capabilityDomains.find((domain) => domain.id === "capability-growth")?.available).toBe(false);
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
