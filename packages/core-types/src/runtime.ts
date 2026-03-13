import type { ChannelConfig } from "./channel.js";
import type { EffectivePolicySource, PolicyProfile } from "./policy.js";
import type { ProviderConfig } from "./provider.js";
import type { SchedulerConfig, TimeConfig } from "./scheduler.js";

export interface RuntimePaths {
  dataDir: string;
  skillsDir: string;
  logsDir: string;
}

export interface RuntimeAssistantConfig {
  name: string;
  persona: string;
  operatorPreferences: string;
  promptOnFirstContact: boolean;
}

export interface RuntimeAttachmentConfig {
  maxFilesPerMessage: number;
  maxImageBytes: number;
  maxDocumentBytes: number;
  maxExtractedChars: number;
}

export interface RuntimeMemoryConfig {
  enabled: boolean;
}

export interface RuntimeToolLoopConfig {
  maxRoundsPerTurn: number;
}

export interface RuntimeFsToolsConfig {
  workspaceOnly: boolean;
  allowedReadPaths: string[];
  allowedWritePaths: string[];
}

export interface RuntimeExecGuardrailsConfig {
  mode: "minimal" | "off" | "strict";
  extraBlockedPatterns: string[];
}

export interface RuntimeExecToolsConfig {
  defaultTimeoutMs: number;
  guardrails: RuntimeExecGuardrailsConfig;
}

export interface RuntimePkgToolsConfig {
  enabled: boolean;
  preferStructuredInstall: boolean;
  allowExecFallback: boolean;
  sudoNonInteractive: boolean;
  allowedManagers: string[];
}

export interface RuntimeWebToolsConfig {
  enabled: boolean;
  searchMode: "hybrid" | "api-only" | "fallback-only";
  requestTimeoutMs: number;
  maxRedirects: number;
  maxFetchBytes: number;
  maxSearchResults: number;
  maxPagesPerRun: number;
}

export interface RuntimeToolsConfig {
  fs: RuntimeFsToolsConfig;
  exec: RuntimeExecToolsConfig;
  pkg: RuntimePkgToolsConfig;
  web?: RuntimeWebToolsConfig;
}

export type RuntimeSystemdFilesystemAccess = "hardened" | "unrestricted";
export type RuntimeServiceManagerKind =
  | "systemd-user"
  | "systemd-system"
  | "launchd"
  | "manual"
  | "unknown";

export interface RuntimeServiceConfig {
  systemdFilesystemAccess: RuntimeSystemdFilesystemAccess;
}

export interface RuntimeDocRef {
  path: string;
  purpose: string;
  whenToUse: string;
}

export type RuntimeCapabilityDomainId =
  | "local-system"
  | "files-documents"
  | "images-attachments"
  | "web-research"
  | "recurring-automation"
  | "capability-growth"
  | "openassist-lifecycle";

export interface RuntimeCapabilityDomain {
  id: RuntimeCapabilityDomainId;
  label: string;
  available: boolean;
  reason: string;
  exampleTasks: string[];
}

export interface RuntimeAwarenessCapabilities {
  canInspectLocalFiles: boolean;
  canRunLocalCommands: boolean;
  canEditConfig: boolean;
  canEditDocs: boolean;
  canEditCode: boolean;
  canControlService: boolean;
  nativeWebAvailable: boolean;
  blockedReasons: string[];
}

export interface RuntimeAwarenessDelivery {
  outboundFileRepliesAvailable: boolean;
  operatorNotifyAvailable: boolean;
  channelSupportsOutboundFiles: boolean;
  channelSupportsDirectRecipientDelivery: boolean;
  notes: string[];
}

export interface RuntimeAwarenessDocumentation {
  refs: RuntimeDocRef[];
  note: string;
}

export interface RuntimeAwarenessMaintenance {
  repoBackedInstall: boolean;
  installDir?: string;
  configPath?: string;
  envFilePath?: string;
  trackedRef?: string;
  lastKnownGoodCommit?: string;
  protectedPaths: string[];
  protectedSurfaces: string[];
  safeEditRules: string[];
  preferredCommands: string[];
}

export interface RuntimeAwarenessGrowth {
  defaultMode: "extensions-first";
  fullRootCanGrowNow: boolean;
  installedSkillCount: number;
  managedHelperCount: number;
  skillsDirectory: string;
  helperToolsDirectory: string;
  updateSafetyNote: string;
}

export type ManagedCapabilityKind = "skill" | "helper-tool";

export interface ManagedCapabilityRecord {
  kind: ManagedCapabilityKind;
  id: string;
  installRoot: string;
  installer: string;
  summary: string;
  updateSafe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeAwarenessSnapshot {
  version: 6;
  software: {
    product: string;
    role: string;
    identity: string;
  };
  host: {
    platform: string;
    release: string;
    arch: string;
    hostname: string;
    nodeVersion: string;
    workspaceRoot?: string;
  };
  runtime: {
    sessionId: string;
    conversationKey: string;
    defaultProviderId: string;
    activeChannelId: string;
    activeChannelType: string;
    providerIds: string[];
    channelIds: string[];
    startedAt?: string;
    timezone: string;
    modules: string[];
  };
  policy: {
    profile: PolicyProfile;
    source: EffectivePolicySource;
    autonomyEnabled: boolean;
    maxToolRoundsPerTurn: number;
    callableToolNames: string[];
    configuredToolNames: string[];
    limitations: string[];
  };
  web: {
    enabled: boolean;
    searchMode: RuntimeWebToolsConfig["searchMode"];
    searchStatus: "disabled" | "available" | "fallback" | "unavailable";
    callableToolNames: string[];
    notes: string[];
  };
  service: {
    manager: RuntimeServiceManagerKind;
    systemdFilesystemAccessConfigured: RuntimeSystemdFilesystemAccess;
    systemdFilesystemAccessEffective: RuntimeSystemdFilesystemAccess | "unknown" | "not-applicable";
    notes: string[];
  };
  delivery: RuntimeAwarenessDelivery;
  capabilities: RuntimeAwarenessCapabilities;
  capabilityDomains: RuntimeCapabilityDomain[];
  documentation: RuntimeAwarenessDocumentation;
  maintenance: RuntimeAwarenessMaintenance;
  growth: RuntimeAwarenessGrowth;
}

export interface RuntimeSecurityConfig {
  auditLogEnabled: boolean;
  secretsBackend: "encrypted-file";
}

export type RuntimeMemoryCategory = "preference" | "fact" | "goal";

export interface RuntimeSessionMemoryRecord {
  sessionId: string;
  summary: string;
  lastCompactedMessageId: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimePermanentMemoryRecord {
  id: number;
  actorScope: string;
  category: RuntimeMemoryCategory;
  summary: string;
  keywords: string[];
  sourceSessionId: string;
  sourceMessageId: number;
  salience: number;
  state: "active" | "forgotten";
  createdAt: string;
  updatedAt: string;
  lastRecalledAt?: string;
  recallCount: number;
}

export interface RuntimeMemoryStatus {
  enabled: boolean;
  sessionId?: string;
  actorScope?: string;
  sessionSummary: RuntimeSessionMemoryRecord | null;
  permanentMemories: RuntimePermanentMemoryRecord[];
  notes: string[];
}

export interface RuntimeConfig {
  bindAddress: string;
  bindPort: number;
  defaultProviderId: string;
  providers: ProviderConfig[];
  channels: ChannelConfig[];
  defaultPolicyProfile: PolicyProfile;
  operatorAccessProfile: Extract<PolicyProfile, "operator" | "full-root">;
  workspaceRoot?: string;
  assistant?: RuntimeAssistantConfig;
  attachments?: RuntimeAttachmentConfig;
  memory?: RuntimeMemoryConfig;
  toolLoop?: RuntimeToolLoopConfig;
  service?: RuntimeServiceConfig;
  paths: RuntimePaths;
  time: TimeConfig;
  scheduler: SchedulerConfig;
  tools?: RuntimeToolsConfig;
  security?: RuntimeSecurityConfig;
}

export interface RuntimeStatus {
  startedAt: string;
  modules: Record<string, "starting" | "running" | "stopped" | "degraded">;
}
