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

export interface RuntimeToolsConfig {
  fs: RuntimeFsToolsConfig;
  exec: RuntimeExecToolsConfig;
  pkg: RuntimePkgToolsConfig;
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
