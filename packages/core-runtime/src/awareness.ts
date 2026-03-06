import type {
  EffectivePolicySource,
  PolicyProfile,
  RuntimeAwarenessSnapshot,
  RuntimeWebToolsConfig
} from "@openassist/core-types";
import type { WebToolStatus } from "@openassist/tools-web";

function joinOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

export interface RuntimeAwarenessBuildInput {
  sessionId: string;
  conversationKey: string;
  startedAt?: string | null;
  defaultProviderId: string;
  providerIds: string[];
  channelIds: string[];
  timezone: string;
  modules: string[];
  host: {
    platform: string;
    release: string;
    arch: string;
    hostname: string;
    nodeVersion: string;
    workspaceRoot?: string;
  };
  profile: PolicyProfile;
  source: EffectivePolicySource;
  configuredToolNames: string[];
  callableToolNames: string[];
  webStatus: WebToolStatus;
}

function buildLimitations(input: RuntimeAwarenessBuildInput): string[] {
  const limitations: string[] = [];
  if (input.profile !== "full-root") {
    limitations.push(
      "Autonomous local-machine actions are disabled in this session until the policy profile is elevated to full-root."
    );
  }
  if (!input.webStatus.enabled) {
    limitations.push("Native web tooling is disabled in runtime config.");
  } else if (input.profile !== "full-root") {
    limitations.push("Native web tools exist but are not callable unless this session is full-root.");
  } else if (input.webStatus.searchStatus === "unavailable") {
    limitations.push(
      "Native web search has no configured API backend right now; configure OPENASSIST_TOOLS_WEB_BRAVE_API_KEY or change tools.web.searchMode."
    );
  } else if (input.webStatus.searchStatus === "fallback") {
    limitations.push("Native web search is operating in DuckDuckGo HTML fallback mode.");
  }
  if (input.callableToolNames.length === 0) {
    limitations.push("No autonomous tools are callable in the current session.");
  }
  return limitations;
}

export function buildRuntimeAwarenessSnapshot(
  input: RuntimeAwarenessBuildInput
): RuntimeAwarenessSnapshot {
  const callableWebTools = input.callableToolNames.filter((item) => item.startsWith("web."));
  return {
    version: 1,
    software: {
      product: "OpenAssist",
      role: "modular local-first AI gateway assistant",
      identity:
        "You are running inside OpenAssist on a real local machine. OpenAssist connects providers, channels, scheduler workflows, recovery, policy gating, and host tools."
    },
    host: {
      ...input.host
    },
    runtime: {
      sessionId: input.sessionId,
      conversationKey: input.conversationKey,
      defaultProviderId: input.defaultProviderId,
      providerIds: input.providerIds,
      channelIds: input.channelIds,
      startedAt: input.startedAt ?? undefined,
      timezone: input.timezone,
      modules: input.modules
    },
    policy: {
      profile: input.profile,
      source: input.source,
      autonomyEnabled: input.profile === "full-root",
      callableToolNames: input.callableToolNames,
      configuredToolNames: input.configuredToolNames,
      limitations: buildLimitations(input)
    },
    web: {
      enabled: input.webStatus.enabled,
      searchMode: input.webStatus.searchMode as RuntimeWebToolsConfig["searchMode"],
      searchStatus: input.webStatus.searchStatus,
      callableToolNames: callableWebTools,
      notes:
        input.webStatus.searchStatus === "available"
          ? ["Brave Search API is configured and available for native web.search requests."]
          : input.webStatus.searchStatus === "fallback"
            ? ["Brave Search API is not active for this session; DuckDuckGo HTML fallback will be used for web.search."]
            : input.webStatus.searchStatus === "disabled"
              ? ["Native web tools are disabled in config."]
              : ["Native web search is unavailable until OPENASSIST_TOOLS_WEB_BRAVE_API_KEY is configured or fallback mode is enabled."]
    }
  };
}

export function buildRuntimeAwarenessSystemMessage(snapshot: RuntimeAwarenessSnapshot): string {
  const hostParts = [
    `platform=${snapshot.host.platform}`,
    `release=${snapshot.host.release}`,
    `arch=${snapshot.host.arch}`,
    `hostname=${snapshot.host.hostname}`,
    `node=${snapshot.host.nodeVersion}`,
    snapshot.host.workspaceRoot ? `workspace=${snapshot.host.workspaceRoot}` : ""
  ].filter((item) => item.length > 0);

  const autonomyLine = snapshot.policy.autonomyEnabled
    ? "Autonomous host and web tools are enabled for this session."
    : "Autonomous host and web tools are disabled for this session.";

  const webLine =
    snapshot.web.searchStatus === "disabled"
      ? "Native web tools are disabled in runtime config."
      : snapshot.web.searchStatus === "available"
        ? `Native web tools are installed and web search is available (${snapshot.web.searchMode}).`
        : snapshot.web.searchStatus === "fallback"
          ? `Native web tools are installed and web search is in fallback mode (${snapshot.web.searchMode}).`
          : `Native web fetch is installed, but web search is unavailable until OPENASSIST_TOOLS_WEB_BRAVE_API_KEY is configured.`;

  return [
    "OpenAssist runtime awareness snapshot",
    `- software: ${snapshot.software.identity}`,
    `- host: ${hostParts.join(", ")}`,
    `- runtime: session=${snapshot.runtime.sessionId}, defaultProvider=${snapshot.runtime.defaultProviderId}, providers=${joinOrNone(snapshot.runtime.providerIds)}, channels=${joinOrNone(snapshot.runtime.channelIds)}, timezone=${snapshot.runtime.timezone}`,
    `- subsystems: ${joinOrNone(snapshot.runtime.modules)}`,
    `- policy: profile=${snapshot.policy.profile}, source=${snapshot.policy.source}; ${autonomyLine}`,
    `- callable tools now: ${joinOrNone(snapshot.policy.callableToolNames)}`,
    `- configured tool families: ${joinOrNone(snapshot.policy.configuredToolNames)}`,
    `- web: ${webLine}`,
    `- limits: ${joinOrNone(snapshot.policy.limitations)}`,
    "- instructions: never claim access to unavailable tools; when web tooling is unavailable or not callable, say so explicitly."
  ].join("\n");
}

export function summarizeRuntimeAwareness(snapshot: RuntimeAwarenessSnapshot): string {
  return [
    `profile=${snapshot.policy.profile}`,
    `source=${snapshot.policy.source}`,
    `autonomy=${snapshot.policy.autonomyEnabled ? "enabled" : "disabled"}`,
    `callableTools=${joinOrNone(snapshot.policy.callableToolNames)}`,
    `web=${snapshot.web.searchStatus}`
  ].join(", ");
}
