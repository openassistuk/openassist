import path from "node:path";
import type {
  EffectivePolicySource,
  PolicyProfile,
  RuntimeAwarenessSnapshot,
  RuntimeWebToolsConfig
} from "@openassist/core-types";
import type { WebToolStatus } from "@openassist/tools-web";
import {
  OPENASSIST_SOFTWARE_IDENTITY,
  RUNTIME_PREFERRED_LIFECYCLE_COMMANDS,
  RUNTIME_PROTECTED_PATHS,
  RUNTIME_PROTECTED_SURFACES,
  RUNTIME_SAFE_EDIT_RULES,
  canFsToolMutatePath,
  getRuntimeSelfKnowledgeDocs
} from "./self-knowledge.js";

function joinOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

export interface RuntimeInstallKnowledgeInput {
  repoBackedInstall: boolean;
  installDir?: string;
  configPath?: string;
  envFilePath?: string;
  trackedRef?: string;
  lastKnownGoodCommit?: string;
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
  workspaceOnly: boolean;
  allowedWritePaths: string[];
  installContext?: RuntimeInstallKnowledgeInput;
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

function canMutateTarget(
  input: RuntimeAwarenessBuildInput,
  targetPath: string | undefined
): boolean {
  if (!targetPath) {
    return false;
  }
  if (input.profile !== "full-root") {
    return false;
  }
  if (!input.callableToolNames.includes("fs.write")) {
    return false;
  }
  return canFsToolMutatePath({
    targetPath,
    workspaceRoot: input.host.workspaceRoot,
    workspaceOnly: input.workspaceOnly,
    allowedWritePaths: input.allowedWritePaths
  });
}

function buildBlockedReasons(
  input: RuntimeAwarenessBuildInput,
  capabilities: RuntimeAwarenessSnapshot["capabilities"]
): string[] {
  const reasons: string[] = [];

  if (input.profile !== "full-root") {
    reasons.push(
      `This session is ${input.profile}, so local file edits, shell commands, package installs, and native web tools are advisory-only.`
    );
  }
  if (input.profile === "full-root" && !capabilities.canInspectLocalFiles) {
    reasons.push("Local file inspection is not callable because fs.read is unavailable in this session.");
  }
  if (input.profile === "full-root" && !capabilities.canRunLocalCommands) {
    reasons.push("Local shell commands are not callable because exec.run is unavailable in this session.");
  }
  if (input.profile === "full-root" && !input.callableToolNames.includes("fs.write")) {
    reasons.push("Local file writes are not callable because fs.write is unavailable in this session.");
  }
  if (input.profile === "full-root" && input.callableToolNames.includes("fs.write") && !input.installContext?.configPath) {
    reasons.push("The runtime does not know the active config path, so safe config self-edits are blocked.");
  }
  if (
    input.profile === "full-root" &&
    input.installContext?.configPath &&
    !capabilities.canEditConfig
  ) {
    reasons.push("The active config path is outside the current filesystem write scope.");
  }

  const repoRoot = input.installContext?.installDir;
  if (input.profile === "full-root" && input.callableToolNames.includes("fs.write") && !repoRoot) {
    reasons.push("The repo-backed install root is not known, so bounded docs/code edits are blocked.");
  }
  if (input.profile === "full-root" && repoRoot && !capabilities.canEditDocs) {
    reasons.push("The local docs tree is outside the current filesystem write scope.");
  }
  if (input.profile === "full-root" && repoRoot && !capabilities.canEditCode) {
    reasons.push("The local code tree is outside the current filesystem write scope.");
  }
  if (!input.webStatus.enabled) {
    reasons.push("Native web tooling is disabled in runtime config.");
  } else if (input.profile === "full-root" && input.webStatus.searchStatus === "unavailable") {
    reasons.push("Native web search has no configured backend right now.");
  }

  return reasons;
}

function buildCapabilities(
  input: RuntimeAwarenessBuildInput
): RuntimeAwarenessSnapshot["capabilities"] {
  const canInspectLocalFiles =
    input.profile === "full-root" && input.callableToolNames.includes("fs.read");
  const canRunLocalCommands =
    input.profile === "full-root" && input.callableToolNames.includes("exec.run");

  const installDir = input.installContext?.installDir;
  const canEditConfig = canMutateTarget(input, input.installContext?.configPath);
  const canEditDocs = canMutateTarget(
    input,
    installDir ? path.join(installDir, "docs", "README.md") : undefined
  );
  const canEditCode = canMutateTarget(
    input,
    installDir ? path.join(installDir, "packages", "core-runtime", "src", "runtime.ts") : undefined
  );
  const canControlService = canRunLocalCommands;
  const nativeWebAvailable =
    input.profile === "full-root" &&
    input.webStatus.enabled &&
    input.callableToolNames.some((item) => item.startsWith("web.")) &&
    input.webStatus.searchStatus !== "disabled" &&
    input.webStatus.searchStatus !== "unavailable";

  const capabilities: RuntimeAwarenessSnapshot["capabilities"] = {
    canInspectLocalFiles,
    canRunLocalCommands,
    canEditConfig,
    canEditDocs,
    canEditCode,
    canControlService,
    nativeWebAvailable,
    blockedReasons: []
  };
  capabilities.blockedReasons = buildBlockedReasons(input, capabilities);
  return capabilities;
}

function buildMaintenance(
  input: RuntimeAwarenessBuildInput
): RuntimeAwarenessSnapshot["maintenance"] {
  const mutableThisSession =
    input.profile === "full-root" && input.callableToolNames.includes("fs.write");
  const safeEditRules = [
    mutableThisSession
      ? "This session may make bounded local config/docs/code changes when the required tools are callable and the target stays outside protected paths and protected lifecycle surfaces."
      : "This session may diagnose and advise, but it must not self-edit local config/docs/code through tools at the current access level.",
    ...RUNTIME_SAFE_EDIT_RULES
  ];

  return {
    repoBackedInstall: input.installContext?.repoBackedInstall === true,
    installDir: input.installContext?.installDir,
    configPath: input.installContext?.configPath,
    envFilePath: input.installContext?.envFilePath,
    trackedRef: input.installContext?.trackedRef,
    lastKnownGoodCommit: input.installContext?.lastKnownGoodCommit,
    protectedPaths: [...RUNTIME_PROTECTED_PATHS],
    protectedSurfaces: [...RUNTIME_PROTECTED_SURFACES],
    safeEditRules,
    preferredCommands: [...RUNTIME_PREFERRED_LIFECYCLE_COMMANDS]
  };
}

export function buildRuntimeAwarenessSnapshot(
  input: RuntimeAwarenessBuildInput
): RuntimeAwarenessSnapshot {
  const callableWebTools = input.callableToolNames.filter((item) => item.startsWith("web."));
  return {
    version: 2,
    software: {
      product: "OpenAssist",
      role: "modular local-first AI gateway assistant",
      identity: OPENASSIST_SOFTWARE_IDENTITY
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
    },
    capabilities: buildCapabilities(input),
    documentation: {
      refs: getRuntimeSelfKnowledgeDocs(),
      note: "Cite these local paths when explaining behavior, configuration, security limits, or update-safe maintenance."
    },
    maintenance: buildMaintenance(input)
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

  const docsLines = snapshot.documentation.refs.map(
    (ref) => `  - ${ref.path}: ${ref.purpose} Use when: ${ref.whenToUse}`
  );

  return [
    "OpenAssist runtime self-knowledge",
    `- software: ${snapshot.software.identity}`,
    `- host: ${hostParts.join(", ")}`,
    `- runtime: session=${snapshot.runtime.sessionId}, defaultProvider=${snapshot.runtime.defaultProviderId}, providers=${joinOrNone(snapshot.runtime.providerIds)}, channels=${joinOrNone(snapshot.runtime.channelIds)}, timezone=${snapshot.runtime.timezone}`,
    `- subsystems: ${joinOrNone(snapshot.runtime.modules)}`,
    `- access: profile=${snapshot.policy.profile}, source=${snapshot.policy.source}, callableTools=${joinOrNone(snapshot.policy.callableToolNames)}`,
    `- capabilities now: inspectFiles=${yesNo(snapshot.capabilities.canInspectLocalFiles)}, runCommands=${yesNo(snapshot.capabilities.canRunLocalCommands)}, editConfig=${yesNo(snapshot.capabilities.canEditConfig)}, editDocs=${yesNo(snapshot.capabilities.canEditDocs)}, editCode=${yesNo(snapshot.capabilities.canEditCode)}, serviceControl=${yesNo(snapshot.capabilities.canControlService)}, nativeWeb=${yesNo(snapshot.capabilities.nativeWebAvailable)}`,
    `- install context: repoBacked=${yesNo(snapshot.maintenance.repoBackedInstall)}, installDir=${snapshot.maintenance.installDir ?? "(not known)"}, config=${snapshot.maintenance.configPath ?? "(not known)"}, envFile=${snapshot.maintenance.envFilePath ?? "(not known)"}, trackedRef=${snapshot.maintenance.trackedRef ?? "(not known)"}, lastKnownGood=${snapshot.maintenance.lastKnownGoodCommit ?? "(not known)"}`,
    "- docs map:",
    ...docsLines,
    `- protected paths: ${joinOrNone(snapshot.maintenance.protectedPaths)}`,
    `- protected surfaces: ${joinOrNone(snapshot.maintenance.protectedSurfaces)}`,
    `- safe maintenance rules: ${snapshot.maintenance.safeEditRules.join(" ")}`,
    `- preferred lifecycle commands: ${joinOrNone(snapshot.maintenance.preferredCommands)}`,
    `- blocked right now: ${joinOrNone(snapshot.capabilities.blockedReasons)}`,
    "- instructions: cite the local doc/config paths above when explaining behavior; never claim unavailable tools or permissions; prefer lifecycle commands over manual service/update/install mutations."
  ].join("\n");
}

export function summarizeRuntimeAwareness(snapshot: RuntimeAwarenessSnapshot): string {
  return [
    `profile=${snapshot.policy.profile}`,
    `source=${snapshot.policy.source}`,
    `fileEdits=${snapshot.capabilities.canEditConfig || snapshot.capabilities.canEditDocs || snapshot.capabilities.canEditCode ? "available" : "blocked"}`,
    `serviceControl=${snapshot.capabilities.canControlService ? "available" : "blocked"}`,
    `web=${snapshot.capabilities.nativeWebAvailable ? "available" : snapshot.web.searchStatus}`
  ].join(", ");
}
