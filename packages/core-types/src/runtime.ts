import type { ChannelConfig } from "./channel.js";
import type { PolicyProfile } from "./policy.js";
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

export interface RuntimeAwarenessSnapshot {
  version: 1;
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
  workspaceRoot?: string;
  assistant?: RuntimeAssistantConfig;
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
