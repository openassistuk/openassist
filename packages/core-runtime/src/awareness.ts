import path from "node:path";
import type {
  ChannelCapabilities,
  EffectivePolicySource,
  PolicyProfile,
  ProviderCapabilities,
  RuntimeCapabilityDomain,
  RuntimeAwarenessSnapshot,
  RuntimeServiceManagerKind,
  RuntimeSystemdFilesystemAccess,
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
  serviceManager?: RuntimeServiceManagerKind;
  systemdFilesystemAccessEffective?:
    | RuntimeSystemdFilesystemAccess
    | "unknown"
    | "not-applicable";
}

export interface RuntimeAwarenessBuildInput {
  sessionId: string;
  conversationKey: string;
  startedAt?: string | null;
  defaultProviderId: string;
  activeChannelId: string;
  activeChannelType: string;
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
  providerCapabilities: ProviderCapabilities;
  channelCapabilities: ChannelCapabilities;
  systemdFilesystemAccessConfigured: RuntimeSystemdFilesystemAccess;
  scheduler: {
    enabled: boolean;
    running: boolean;
    blockedReason?: string;
    taskCount: number;
  };
  growth: {
    installedSkillCount: number;
    managedHelperCount: number;
    skillsDirectory: string;
    helperToolsDirectory: string;
  };
  installContext?: RuntimeInstallKnowledgeInput;
}

function isSystemdManager(
  manager: RuntimeServiceManagerKind
): manager is Extract<RuntimeServiceManagerKind, "systemd-user" | "systemd-system"> {
  return manager === "systemd-user" || manager === "systemd-system";
}

type RuntimeServiceBoundaryInput = Pick<
  RuntimeAwarenessBuildInput,
  "systemdFilesystemAccessConfigured" | "installContext"
>;

function resolveServiceBoundary(input: RuntimeServiceBoundaryInput): {
  manager: RuntimeServiceManagerKind;
  configured: RuntimeSystemdFilesystemAccess;
  effective: RuntimeSystemdFilesystemAccess | "unknown" | "not-applicable";
} {
  const manager = input.installContext?.serviceManager ?? "unknown";
  const configured = input.systemdFilesystemAccessConfigured;
  const effective =
    input.installContext?.systemdFilesystemAccessEffective ??
    (manager === "launchd" ? "not-applicable" : "unknown");

  return {
    manager,
    configured,
    effective
  };
}

function buildServiceNotes(
  boundary: ReturnType<typeof resolveServiceBoundary>
): string[] {
  if (boundary.manager === "launchd") {
    return ["Linux systemd filesystem access is not applicable when OpenAssist runs under launchd."];
  }

  if (isSystemdManager(boundary.manager)) {
    const notes =
      boundary.effective === "unrestricted"
        ? [
            "The active Linux systemd service is running without OpenAssist-added systemd hardening."
          ]
        : boundary.effective === "hardened"
          ? [
              "Linux systemd service hardening is active, so package installs, sudo, and broader host writes may still be blocked even in full-root sessions."
            ]
          : [
              "The active Linux systemd filesystem access mode is unknown in this process, so the live package-install and host-write boundary may still differ from config."
            ];

    if (
      boundary.effective !== "unknown" &&
      boundary.configured !== boundary.effective
    ) {
      notes.push(
        boundary.configured === "unrestricted"
          ? "Config requests unrestricted Linux systemd filesystem access, but the running service still reports hardened. Reinstall or restart the service to apply the change."
          : "Config requests hardened Linux systemd filesystem access, but the running service still reports unrestricted. Reinstall or restart the service to restore the sandbox."
      );
    } else if (
      boundary.configured === "unrestricted" &&
      boundary.effective === "unknown"
    ) {
      notes.push(
        "Config requests unrestricted Linux systemd filesystem access, but the active service mode is unknown until the managed service reports it."
      );
    }

    return notes;
  }

  return [
    "The active service manager is unknown in this process, so manual or dev runs may not reflect the installed service boundary."
  ];
}

export function buildRuntimeServiceAwareness(
  input: RuntimeServiceBoundaryInput
): RuntimeAwarenessSnapshot["service"] {
  const boundary = resolveServiceBoundary(input);
  return {
    manager: boundary.manager,
    systemdFilesystemAccessConfigured: boundary.configured,
    systemdFilesystemAccessEffective: boundary.effective,
    notes: buildServiceNotes(boundary)
  };
}

function buildLimitations(input: RuntimeAwarenessBuildInput): string[] {
  const limitations: string[] = [];
  const serviceBoundary = resolveServiceBoundary(input);
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
  if (input.profile === "full-root" && isSystemdManager(serviceBoundary.manager)) {
    if (serviceBoundary.effective === "hardened") {
      limitations.push(
        "Linux systemd filesystem hardening is still active for the daemon service, so package installs, sudo, and broader host writes may still be blocked in this full-root session."
      );
    } else if (serviceBoundary.effective === "unknown") {
      limitations.push(
        "The active Linux systemd filesystem mode is unknown in this process, so package installs and broader host writes may still be blocked until the managed service is restarted and reports its live boundary."
      );
    }
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
  const serviceBoundary = resolveServiceBoundary(input);

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
  if (input.profile === "full-root" && isSystemdManager(serviceBoundary.manager)) {
    if (serviceBoundary.effective === "hardened") {
      reasons.push(
        "Linux systemd service hardening is active, so package installs, sudo, and broader host writes may still be blocked even though OpenAssist tool policy is full-root."
      );
    } else if (serviceBoundary.effective === "unknown") {
      reasons.push(
        "The active Linux systemd filesystem mode is unknown in this process, so package installs and broader host writes are not guaranteed until the managed service reports its live boundary."
      );
    }
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

function buildCapabilityDomains(
  input: RuntimeAwarenessBuildInput,
  capabilities: RuntimeAwarenessSnapshot["capabilities"]
): RuntimeCapabilityDomain[] {
  const fullRootCanGrowNow =
    input.profile === "full-root" &&
    input.callableToolNames.includes("fs.write") &&
    (input.callableToolNames.includes("pkg.install") || input.callableToolNames.includes("exec.run"));
  const localSystemAvailable = capabilities.canRunLocalCommands || capabilities.canInspectLocalFiles;
  const filesDocumentsAvailable =
    capabilities.canInspectLocalFiles ||
    input.channelCapabilities.supportsDocumentAttachments ||
    input.channelCapabilities.supportsImageAttachments;
  const imagesAttachmentsAvailable =
    input.channelCapabilities.supportsImageAttachments ||
    input.channelCapabilities.supportsDocumentAttachments;
  const webResearchAvailable = capabilities.nativeWebAvailable;
  const recurringAutomationAvailable =
    input.scheduler.enabled &&
    (capabilities.canEditConfig || capabilities.canEditCode || fullRootCanGrowNow);

  return [
    {
      id: "local-system",
      label: "Local system tasks",
      available: localSystemAvailable,
      reason: localSystemAvailable
        ? "OpenAssist can inspect or act on host software, services, and shell tasks in this session."
        : input.profile !== "full-root"
          ? "Direct host actions are blocked until this session has full access."
          : "Host actions are still blocked because the required file or command tools are not callable.",
      exampleTasks: [
        "check disk usage and clean up logs",
        "restart a service",
        "inspect package versions"
      ]
    },
    {
      id: "files-documents",
      label: "Files and documents",
      available: filesDocumentsAvailable,
      reason: capabilities.canInspectLocalFiles
        ? "OpenAssist can inspect local files and work with supported inbound documents in this session."
        : imagesAttachmentsAvailable
          ? "This chat can deliver supported attachments, but local filesystem inspection is blocked in this session."
          : "Neither local filesystem inspection nor supported inbound attachments are available right now.",
      exampleTasks: [
        "summarize a local config file",
        "organize notes or docs",
        "extract the key points from a supported text attachment"
      ]
    },
    {
      id: "images-attachments",
      label: "Images and chat attachments",
      available: imagesAttachmentsAvailable,
      reason: !imagesAttachmentsAvailable
        ? "This channel does not expose supported inbound images or documents to the runtime."
        : input.providerCapabilities.supportsImageInputs
          ? "This channel supports inbound images/documents, and the current provider can inspect image inputs."
          : "This channel supports inbound attachments, but the current provider cannot inspect image binaries; captions and supported extracted text still work.",
      exampleTasks: [
        "inspect a supported image attachment",
        "use a caption plus attached image for context",
        "review a supported text-like document upload"
      ]
    },
    {
      id: "web-research",
      label: "Web research",
      available: webResearchAvailable,
      reason: webResearchAvailable
        ? "Native web search and fetch tools are callable in this session."
        : !input.webStatus.enabled
          ? "Native web tools are disabled in runtime config."
          : input.profile !== "full-root"
            ? "Native web tools exist, but they are callable only in full access."
            : "Native web tooling is configured but not currently usable because the search backend is unavailable.",
      exampleTasks: [
        "research a package or API change",
        "fetch and summarize a webpage",
        "compare recent documentation updates"
      ]
    },
    {
      id: "recurring-automation",
      label: "Recurring automations",
      available: recurringAutomationAvailable,
      reason: !input.scheduler.enabled
        ? "The scheduler is disabled in config."
        : input.scheduler.running
          ? "The scheduler is enabled and running, so OpenAssist can help with recurring task changes."
          : input.scheduler.blockedReason
            ? `The scheduler is enabled but not currently running: ${input.scheduler.blockedReason}.`
            : "The scheduler is enabled, but this session cannot safely change automation state yet.",
      exampleTasks: [
        "review scheduled tasks",
        "add a recurring reminder or maintenance task",
        "install a skill used by scheduled workflows"
      ]
    },
    {
      id: "capability-growth",
      label: "Capability growth",
      available: fullRootCanGrowNow,
      reason: fullRootCanGrowNow
        ? "This session can install managed skills, register helper tools, and use controlled package growth."
        : input.profile !== "full-root"
          ? "This session can inspect growth state, but installing or registering growth assets needs full access."
          : "Growth actions still need callable write and install tools in this session.",
      exampleTasks: [
        "install a managed skill from a local directory",
        "register a helper tool under the managed growth registry",
        "set up durable helper tooling outside tracked repo files"
      ]
    },
    {
      id: "openassist-lifecycle",
      label: "OpenAssist lifecycle",
      available: true,
      reason: capabilities.canControlService
        ? "OpenAssist can explain and, when appropriate, act on health, service, and update workflows in this session."
        : "OpenAssist can always explain lifecycle state and diagnostics, but direct service control may be blocked in this session.",
      exampleTasks: [
        "run or interpret openassist doctor",
        "restart the service safely",
        "prepare a safe update dry-run"
      ]
    }
  ];
}

function buildMaintenance(
  input: RuntimeAwarenessBuildInput
): RuntimeAwarenessSnapshot["maintenance"] {
  const mutableThisSession =
    input.profile === "full-root" && input.callableToolNames.includes("fs.write");
  const safeEditRules = [
    mutableThisSession
      ? "This session may make bounded local config/docs/code changes when the required tools are callable and the target stays outside protected paths and protected lifecycle surfaces. Managed skills and helper tools remain the preferred durable growth path."
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

function buildGrowth(
  input: RuntimeAwarenessBuildInput
): RuntimeAwarenessSnapshot["growth"] {
  return {
    defaultMode: "extensions-first",
    fullRootCanGrowNow:
      input.profile === "full-root" &&
      input.callableToolNames.includes("fs.write") &&
      (input.callableToolNames.includes("pkg.install") || input.callableToolNames.includes("exec.run")),
    installedSkillCount: input.growth.installedSkillCount,
    managedHelperCount: input.growth.managedHelperCount,
    skillsDirectory: path.resolve(input.growth.skillsDirectory),
    helperToolsDirectory: path.resolve(input.growth.helperToolsDirectory),
    updateSafetyNote:
      "Managed skills and helper tools live under runtime-owned directories so they survive normal updates more predictably than direct repo edits. Direct repo mutation is still possible in full access, but it remains advanced and less update-safe."
  };
}

function buildService(
  input: RuntimeAwarenessBuildInput
): RuntimeAwarenessSnapshot["service"] {
  return buildRuntimeServiceAwareness(input);
}

export function buildRuntimeAwarenessSnapshot(
  input: RuntimeAwarenessBuildInput
): RuntimeAwarenessSnapshot {
  const callableWebTools = input.callableToolNames.filter((item) => item.startsWith("web."));
  const capabilities = buildCapabilities(input);
  return {
    version: 4,
    software: {
      product: "OpenAssist",
      role: "local-first machine assistant with bounded host, chat, tool, and lifecycle awareness",
      identity: OPENASSIST_SOFTWARE_IDENTITY
    },
    host: {
      ...input.host
    },
    runtime: {
      sessionId: input.sessionId,
      conversationKey: input.conversationKey,
      defaultProviderId: input.defaultProviderId,
      activeChannelId: input.activeChannelId,
      activeChannelType: input.activeChannelType,
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
    service: buildService(input),
    capabilities,
    capabilityDomains: buildCapabilityDomains(input, capabilities),
    documentation: {
      refs: getRuntimeSelfKnowledgeDocs(),
      note: "Cite these local paths when explaining OpenAssist behavior, configuration, security limits, lifecycle actions, or managed growth."
    },
    maintenance: buildMaintenance(input),
    growth: buildGrowth(input)
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
  const capabilityDomainLines = snapshot.capabilityDomains.map(
    (domain) =>
      `  - ${domain.id} (${domain.label}): available=${yesNo(domain.available)}; reason=${domain.reason}; examples=${joinOrNone(domain.exampleTasks)}`
  );

  return [
    "OpenAssist runtime self-knowledge",
    `- software: ${snapshot.software.identity}`,
    "- role: OpenAssist is the broader assistant for this machine, not only a repo editor. It can help across system tasks, files, supported attachments, web work, automation, lifecycle commands, and controlled capability growth when the current stack really allows it.",
    `- host: ${hostParts.join(", ")}`,
    `- runtime: session=${snapshot.runtime.sessionId}, defaultProvider=${snapshot.runtime.defaultProviderId}, activeChannel=${snapshot.runtime.activeChannelId}/${snapshot.runtime.activeChannelType}, providers=${joinOrNone(snapshot.runtime.providerIds)}, channels=${joinOrNone(snapshot.runtime.channelIds)}, timezone=${snapshot.runtime.timezone}`,
    `- subsystems: ${joinOrNone(snapshot.runtime.modules)}`,
    `- access: profile=${snapshot.policy.profile}, source=${snapshot.policy.source}, callableTools=${joinOrNone(snapshot.policy.callableToolNames)}`,
    `- service: manager=${snapshot.service.manager}, systemdConfigured=${snapshot.service.systemdFilesystemAccessConfigured}, systemdEffective=${snapshot.service.systemdFilesystemAccessEffective}, notes=${joinOrNone(snapshot.service.notes)}`,
    `- capabilities now: inspectFiles=${yesNo(snapshot.capabilities.canInspectLocalFiles)}, runCommands=${yesNo(snapshot.capabilities.canRunLocalCommands)}, editConfig=${yesNo(snapshot.capabilities.canEditConfig)}, editDocs=${yesNo(snapshot.capabilities.canEditDocs)}, editCode=${yesNo(snapshot.capabilities.canEditCode)}, serviceControl=${yesNo(snapshot.capabilities.canControlService)}, nativeWeb=${yesNo(snapshot.capabilities.nativeWebAvailable)}`,
    "- capability domains:",
    ...capabilityDomainLines,
    `- install context: repoBacked=${yesNo(snapshot.maintenance.repoBackedInstall)}, installDir=${snapshot.maintenance.installDir ?? "(not known)"}, config=${snapshot.maintenance.configPath ?? "(not known)"}, envFile=${snapshot.maintenance.envFilePath ?? "(not known)"}, trackedRef=${snapshot.maintenance.trackedRef ?? "(not known)"}, lastKnownGood=${snapshot.maintenance.lastKnownGoodCommit ?? "(not known)"}`,
    `- growth: mode=${snapshot.growth.defaultMode}, fullRootCanGrowNow=${yesNo(snapshot.growth.fullRootCanGrowNow)}, skills=${snapshot.growth.installedSkillCount}, helpers=${snapshot.growth.managedHelperCount}, skillsDir=${snapshot.growth.skillsDirectory}, helperToolsDir=${snapshot.growth.helperToolsDirectory}`,
    `- update-safe growth note: ${snapshot.growth.updateSafetyNote}`,
    "- docs map:",
    ...docsLines,
    `- protected paths: ${joinOrNone(snapshot.maintenance.protectedPaths)}`,
    `- protected surfaces: ${joinOrNone(snapshot.maintenance.protectedSurfaces)}`,
    `- safe maintenance rules: ${snapshot.maintenance.safeEditRules.join(" ")}`,
    `- preferred lifecycle commands: ${joinOrNone(snapshot.maintenance.preferredCommands)}`,
    `- blocked right now: ${joinOrNone(snapshot.capabilities.blockedReasons)}`,
    "- instructions: cite the local doc/config paths above when explaining behavior; never claim unavailable tools or permissions; prefer extensions-first growth and lifecycle commands over risky manual mutations."
  ].join("\n");
}

export function summarizeRuntimeAwareness(snapshot: RuntimeAwarenessSnapshot): string {
  return [
    `profile=${snapshot.policy.profile}`,
    `source=${snapshot.policy.source}`,
    `service=${snapshot.service.manager}:${snapshot.service.systemdFilesystemAccessConfigured}->${snapshot.service.systemdFilesystemAccessEffective}`,
    `fileEdits=${snapshot.capabilities.canEditConfig || snapshot.capabilities.canEditDocs || snapshot.capabilities.canEditCode ? "available" : "blocked"}`,
    `serviceControl=${snapshot.capabilities.canControlService ? "available" : "blocked"}`,
    `web=${snapshot.capabilities.nativeWebAvailable ? "available" : snapshot.web.searchStatus}`,
    `growth=${snapshot.growth.fullRootCanGrowNow ? "available" : "inspect-only"}`
  ].join(", ");
}
