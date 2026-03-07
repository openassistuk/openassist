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

export interface RuntimeDocRef {
  path: string;
  purpose: string;
  whenToUse: string;
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
  safeEditRules: string[];
  preferredCommands: string[];
}

export interface RuntimeAwarenessSnapshot {
  version: 2;
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
  capabilities: RuntimeAwarenessCapabilities;
  documentation: RuntimeAwarenessDocumentation;
  maintenance: RuntimeAwarenessMaintenance;
}

export interface RuntimeSecurityConfig {
  auditLogEnabled: boolean;
  secretsBackend: "encrypted-file";
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
