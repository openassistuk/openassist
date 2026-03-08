import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AttachmentRef,
  ApiKeyAuth,
  ChannelAdapter,
  ChatRequest,
  ChatResponse,
  EffectivePolicySource,
  InboundEnvelope,
  ManagedCapabilityRecord,
  MisfirePolicy,
  NormalizedMessage,
  OAuthStartResult,
  OutboundEnvelope,
  PolicyProfile,
  PolicyResolution,
  ProviderAdapter,
  ProviderAuthHandle,
  RuntimeConfig,
  RuntimeAwarenessSnapshot,
  RuntimeStatus,
  ScheduledTaskConfig,
  SkillManifest,
  ToolCall,
  ToolSchema,
  TimeStatus
} from "@openassist/core-types";
import { RecoveryWorker } from "@openassist/recovery";
import type { OpenAssistDatabase } from "@openassist/storage-sqlite";
import { FileSkillRuntime, validateSkillManifest } from "@openassist/skills-engine";
import { ExecTool } from "@openassist/tools-exec";
import { FsTool } from "@openassist/tools-fs";
import { PackageInstallTool } from "@openassist/tools-package";
import { WebTool } from "@openassist/tools-web";
import { redactSensitiveData, type OpenAssistLogger } from "@openassist/observability";
import {
  buildRuntimeAwarenessSnapshot,
  buildRuntimeAwarenessSystemMessage,
  summarizeRuntimeAwareness,
  type RuntimeInstallKnowledgeInput
} from "./awareness.js";
import { ingestInboundAttachments } from "./attachments.js";
import { renderOutboundEnvelope } from "./channel-rendering.js";
import { ContextPlanner, sanitizeUserOutput } from "./context.js";
import {
  ClockHealthMonitor,
  detectSystemTimezoneCandidate,
  validateTimezone
} from "./clock-health.js";
import { DatabasePolicyEngine } from "./policy-engine.js";
import { SecretBox } from "./secrets.js";
import {
  OPENASSIST_SOFTWARE_IDENTITY,
  resolveManagedHelperToolsDir
} from "./self-knowledge.js";
import { SchedulerWorker } from "./scheduler.js";
import { runtimeToolSchemas } from "./tool-registry.js";
import { RuntimeToolRouter, type ToolExecutionRecord } from "./tool-router.js";

export interface RuntimeDependencies {
  db: OpenAssistDatabase;
  logger: OpenAssistLogger;
  installContext?: RuntimeInstallContext;
}

export interface RuntimeAdapterSet {
  providers: ProviderAdapter[];
  channels: ChannelAdapter[];
}

export interface RuntimeAuthMap {
  [providerId: string]: ApiKeyAuth | ProviderAuthHandle;
}

export interface RuntimeInstallContext extends RuntimeInstallKnowledgeInput {}

function defaultSystemPrompt(): string {
  return [
    "You are OpenAssist, the main local-first assistant for this machine.",
    "Use the runtime self-knowledge pack to stay grounded in what OpenAssist is, where it is running, what the current provider, channel, tools, and access level really make possible, and which local docs/config/install files define its behavior.",
    "OpenAssist can help with local system tasks, files and supported attachments, web work, recurring automations, lifecycle actions, and controlled capability growth when the current session truly allows it.",
    "Prefer extensions-first growth for durable capability expansion: managed skills and helper tools are safer than editing tracked repo files.",
    "Be cautiously creative when permissions allow local action: prefer the smallest reversible fix, validate after changes, and stop when access or protected lifecycle boundaries block a safe edit.",
    "When tools, permissions, or local docs are unavailable, say so explicitly instead of pretending they exist.",
    "Never expose internal reasoning metadata to messaging channels.",
    "Use concise, actionable responses and report errors clearly.",
    "Prefer short sections, bullets, and brief paragraphs over dense walls of text."
  ].join("\n");
}

function sessionIdFromEnvelope(envelope: InboundEnvelope): string {
  return `${envelope.channelId}:${envelope.conversationKey}`;
}

function conversationKeyFromSessionId(sessionId: string): string {
  const separatorIndex = sessionId.indexOf(":");
  if (separatorIndex < 0) {
    return "__status__";
  }
  return sessionId.slice(separatorIndex + 1);
}

function channelIdFromSessionId(sessionId: string): string {
  const separatorIndex = sessionId.indexOf(":");
  if (separatorIndex < 0) {
    return sessionId;
  }
  return sessionId.slice(0, separatorIndex);
}

function randomToken(size = 24): string {
  return crypto.randomBytes(size).toString("base64url");
}

function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

const CONFIRMED_TIMEZONE_SETTING_KEY = "time.confirmedTimezone";
const GLOBAL_ASSISTANT_PROFILE_SETTING_KEY = "assistant.globalProfile";
const GLOBAL_ASSISTANT_PROFILE_LOCK_SETTING_KEY = "assistant.globalProfileLock";
const SESSION_BOOTSTRAP_CORE_IDENTITY = [
  OPENASSIST_SOFTWARE_IDENTITY,
  "It is restart-safe via durable SQLite state, idempotency keys, and replay workers.",
  "It must never expose internal reasoning traces in channel output."
].join(" ");
const SESSION_PROFILE_COMMAND_PREFIX = "/profile";
const SESSION_ACCESS_COMMAND_PREFIX = "/access";
const SESSION_START_COMMAND_PREFIX = "/start";
const SESSION_HELP_COMMAND_PREFIX = "/help";
const SESSION_CAPABILITIES_COMMAND_PREFIX = "/capabilities";
const SESSION_GROW_COMMAND_PREFIX = "/grow";
const PROFILE_FIELD_KEYS = new Set(["name", "persona", "prefs", "preferences"]);
const PROFILE_FORCE_FIELD_KEYS = new Set(["force"]);

function describeAccessMode(profile: PolicyProfile): string {
  if (profile === "full-root") {
    return "Full access (full-root)";
  }
  if (profile === "operator") {
    return "Standard access (operator)";
  }
  return "Restricted access";
}

function describeAccessSource(source: EffectivePolicySource): string {
  if (source === "actor-override") {
    return "sender-specific override for this chat";
  }
  if (source === "session-override") {
    return "chat-wide override";
  }
  if (source === "channel-operator-default") {
    return "approved operator default for this channel";
  }
  return "runtime default";
}

function encodePathSegment(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function toDisplayText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function renderScheduledOutput(
  messageTemplate: string | undefined,
  resultText: string,
  taskId: string,
  scheduledFor: string
): string {
  if (!messageTemplate) {
    return resultText;
  }

  return messageTemplate
    .replaceAll("{{result}}", resultText)
    .replaceAll("{{taskId}}", taskId)
    .replaceAll("{{scheduledFor}}", scheduledFor);
}

function parseForceFlag(rawValue: string): boolean {
  const normalized = rawValue.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "y" ||
    normalized === "on"
  );
}

function parseProfileCommand(text: string): {
  name?: string;
  persona?: string;
  operatorPreferences?: string;
  force: boolean;
} {
  const raw = text.trim();
  const remainder = raw.startsWith(SESSION_PROFILE_COMMAND_PREFIX)
    ? raw.slice(SESSION_PROFILE_COMMAND_PREFIX.length).trim()
    : raw;

  if (remainder.length === 0) {
    return { force: false };
  }

  const updates: {
    name?: string;
    persona?: string;
    operatorPreferences?: string;
    force: boolean;
  } = { force: false };

  const assignments = remainder.split(";");
  for (const assignment of assignments) {
    const trimmed = assignment.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed === "--force" || trimmed.toLowerCase() === "force") {
      updates.force = true;
      continue;
    }

    const [keyPart, ...valueParts] = trimmed.split("=");
    if (!keyPart) {
      continue;
    }
    const key = keyPart.trim().toLowerCase();
    if (PROFILE_FORCE_FIELD_KEYS.has(key)) {
      if (valueParts.length === 0) {
        updates.force = true;
      } else {
        updates.force = parseForceFlag(valueParts.join("="));
      }
      continue;
    }
    if (valueParts.length === 0) {
      continue;
    }
    if (!PROFILE_FIELD_KEYS.has(key)) {
      continue;
    }
    const value = valueParts.join("=").trim();
    if (value.length === 0) {
      continue;
    }

    if (key === "name") {
      updates.name = value;
    } else if (key === "persona") {
      updates.persona = value;
    } else {
      updates.operatorPreferences = value;
    }
  }

  return updates;
}

function parseAccessCommand(text: string): {
  desiredProfile?: Extract<PolicyProfile, "operator" | "full-root">;
  error?: string;
} {
  const raw = text.trim();
  const remainder = raw.startsWith(SESSION_ACCESS_COMMAND_PREFIX)
    ? raw.slice(SESSION_ACCESS_COMMAND_PREFIX.length).trim().toLowerCase()
    : raw.toLowerCase();

  if (remainder.length === 0) {
    return {};
  }
  if (remainder === "full" || remainder === "full-root") {
    return { desiredProfile: "full-root" };
  }
  if (remainder === "standard" || remainder === "operator") {
    return { desiredProfile: "operator" };
  }

  return {
    error: "Use '/access' to inspect access, '/access full' for full access, or '/access standard' for standard access."
  };
}

const DEFAULT_MAX_TOOL_ROUNDS = 8;

const DEFAULT_FS_TOOLS = {
  workspaceOnly: true,
  allowedReadPaths: [] as string[],
  allowedWritePaths: [] as string[]
};

const DEFAULT_EXEC_TOOLS = {
  defaultTimeoutMs: 60_000,
  guardrails: {
    mode: "minimal" as const,
    extraBlockedPatterns: [] as string[]
  }
};

const DEFAULT_PKG_TOOLS = {
  enabled: true,
  preferStructuredInstall: true,
  allowExecFallback: true,
  sudoNonInteractive: true,
  allowedManagers: [] as string[]
};

const DEFAULT_WEB_TOOLS = {
  enabled: true,
  searchMode: "hybrid" as const,
  requestTimeoutMs: 15_000,
  maxRedirects: 5,
  maxFetchBytes: 1_000_000,
  maxSearchResults: 8,
  maxPagesPerRun: 4
};

const DEFAULT_ASSISTANT_CONFIG = {
  name: "OpenAssist",
  persona: "Pragmatic, concise, and execution-focused local AI assistant.",
  operatorPreferences: "",
  promptOnFirstContact: true
} as const;

interface GlobalAssistantProfile {
  name: string;
  persona: string;
  operatorPreferences: string;
}

interface GlobalAssistantProfileLock {
  locked: boolean;
  lockMode: "first-boot-lock-in";
  lockedAt: string;
  lastForcedUpdateAt?: string;
}

interface RuntimeGrowthStatus {
  defaultMode: "extensions-first";
  fullRootCanGrowNow: boolean;
  profile: PolicyProfile;
  profileSource: EffectivePolicySource;
  updateSafetyNote: string;
  skillsDirectory: string;
  helperToolsDirectory: string;
  installedSkills: SkillManifest[];
  managedHelpers: ManagedCapabilityRecord[];
}

interface ManagedHelperRegistrationInput {
  id: string;
  installRoot: string;
  installer: string;
  summary: string;
}

export class OpenAssistRuntime {
  private config: RuntimeConfig;
  private readonly db: OpenAssistDatabase;
  private readonly logger: OpenAssistLogger;
  private readonly providers = new Map<string, ProviderAdapter>();
  private readonly channels = new Map<string, ChannelAdapter>();
  private readonly channelTypes = new Map<string, RuntimeConfig["channels"][number]["type"]>();
  private readonly apiKeyAuth = new Map<string, ApiKeyAuth>();
  private readonly auth = new Map<string, ApiKeyAuth | ProviderAuthHandle>();
  private readonly policyEngine: DatabasePolicyEngine;
  private readonly contextPlanner = new ContextPlanner();
  private readonly recoveryWorker: RecoveryWorker;
  private readonly skillRuntime: FileSkillRuntime;
  private execTool!: ExecTool;
  private fsTool!: FsTool;
  private pkgTool!: PackageInstallTool;
  private webTool!: WebTool;
  private toolRouter!: RuntimeToolRouter;
  private readonly secretBox: SecretBox;
  private readonly clockHealthMonitor: ClockHealthMonitor;
  private readonly schedulerWorker: SchedulerWorker;
  private effectiveTimezone: string;
  private startedAt: string | null = null;
  private startupEpoch = 0;
  private readonly hostSystemProfile: Record<string, unknown>;
  private readonly installContext: RuntimeInstallContext;

  constructor(config: RuntimeConfig, deps: RuntimeDependencies, adapters: RuntimeAdapterSet) {
    const configuredSecretsBackend =
      (config.security as { secretsBackend?: string } | undefined)?.secretsBackend ??
      "encrypted-file";
    if (configuredSecretsBackend !== "encrypted-file") {
      throw new Error(
        `Unsupported security.secretsBackend '${configuredSecretsBackend}'. ` +
          "Only 'encrypted-file' is supported."
      );
    }

    this.config = config;
    this.db = deps.db;
    this.logger = deps.logger;

    for (const provider of adapters.providers) {
      this.providers.set(provider.id(), provider);
    }

    for (const channel of adapters.channels) {
      this.channels.set(channel.id(), channel);
    }
    for (const channelConfig of config.channels) {
      this.channelTypes.set(channelConfig.id, channelConfig.type);
    }

    this.policyEngine = new DatabasePolicyEngine({
      db: this.db,
      defaultProfile: config.defaultPolicyProfile,
      operatorAccessProfile: config.operatorAccessProfile ?? "operator",
      channels: config.channels
    });

    this.skillRuntime = new FileSkillRuntime({
      skillsRoot: config.paths.skillsDir
    });
    this.secretBox = new SecretBox({
      dataDir: config.paths.dataDir
    });
    fs.mkdirSync(this.managedHelperToolsDir(), { recursive: true });
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(this.managedHelperToolsDir(), 0o700);
      } catch {
        // Best-effort helper-tools directory hardening.
      }
    }
    this.installContext = {
      repoBackedInstall: false,
      ...(deps.installContext ?? {})
    };
    this.effectiveTimezone = config.time.defaultTimezone ?? detectSystemTimezoneCandidate();
    this.hostSystemProfile = {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      nodeVersion: process.version,
      ...(config.workspaceRoot ? { workspaceRoot: config.workspaceRoot } : {})
    };
    this.rebuildRuntimeTools();

    this.recoveryWorker = new RecoveryWorker({
      db: this.db,
      logger: this.logger,
      handlers: {
        send_outbound: async (payload) => {
          const channelId = String(payload.channelId ?? "");
          const sessionId = String(payload.sessionId ?? "");
          const envelope = payload.envelope as OutboundEnvelope | undefined;
          if (!envelope) {
            throw new Error("Missing outbound envelope in job payload");
          }
          const channel = this.channels.get(channelId);
          if (!channel) {
            throw new Error(`Channel adapter ${channelId} not found`);
          }
          const sent = await channel.send(envelope);
          this.db.recordOutbound(sessionId, envelope, sent.transportMessageId);
        },
        scheduled_task_execute: async (payload) => {
          await this.executeScheduledTaskJob(payload);
        }
      }
    });

    this.clockHealthMonitor = new ClockHealthMonitor({
      db: this.db,
      logger: this.logger,
      getConfig: () => this.config,
      getEffectiveTimezone: () => this.getEffectiveTimezone(),
      isTimezoneConfirmed: () => this.isTimezoneConfirmed()
    });

    this.schedulerWorker = new SchedulerWorker({
      db: this.db,
      logger: this.logger,
      getConfig: () => this.config,
      getEffectiveTimezone: () => this.getEffectiveTimezone(),
      isTimezoneConfirmed: () => this.isTimezoneConfirmed(),
      enqueueScheduledExecution: (payload) => {
        this.recoveryWorker.enqueue(
          "scheduled_task_execute",
          payload as unknown as Record<string, unknown>,
          {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 30_000
          }
        );
      }
    });
  }

  private managedHelperToolsDir(): string {
    return resolveManagedHelperToolsDir(this.config.paths.dataDir);
  }

  private isPathInsideRoot(targetPath: string, rootPath: string): boolean {
    const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  private isManagedPathUpdateSafe(targetPath: string): boolean {
    const helperToolsDir = this.managedHelperToolsDir();
    const resolvedTarget = path.resolve(targetPath);
    if (this.isPathInsideRoot(resolvedTarget, helperToolsDir)) {
      return true;
    }

    const installDir = this.installContext.installDir;
    if (!installDir) {
      return true;
    }

    return !this.isPathInsideRoot(resolvedTarget, installDir);
  }

  private syncManagedSkills(skills: SkillManifest[]): void {
    const seenIds: string[] = [];
    for (const skill of skills) {
      const installRoot = path.join(this.config.paths.skillsDir, skill.id);
      seenIds.push(skill.id);
      this.db.registerSkill(skill.id, skill.version, skill as unknown as Record<string, unknown>);
      this.db.upsertManagedCapability({
        kind: "skill",
        id: skill.id,
        installRoot,
        installer: "skill-path-copy",
        summary: skill.description,
        updateSafe: true
      });
    }
    this.db.deleteManagedCapabilitiesNotInSet("skill", seenIds);
  }

  private listInstalledSkillsSync(): SkillManifest[] {
    const skillsRoot = path.resolve(this.config.paths.skillsDir);
    if (!fs.existsSync(skillsRoot)) {
      return [];
    }

    const entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
    const manifests: SkillManifest[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const manifestPath = path.join(skillsRoot, entry.name, "openassist.skill.json");
      if (!fs.existsSync(manifestPath)) {
        continue;
      }

      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        manifests.push(validateSkillManifest(parsed));
      } catch {
        // Ignore malformed manifests in live status snapshots.
      }
    }

    return manifests.sort((left, right) => left.id.localeCompare(right.id));
  }

  setProviderApiKey(providerId: string, apiKey: string): void {
    const auth = {
      providerId,
      apiKey
    };
    this.apiKeyAuth.set(providerId, auth);
    if (!this.auth.has(providerId)) {
      this.auth.set(providerId, auth);
    }
  }

  setProviderOAuthAuth(handle: ProviderAuthHandle): void {
    this.auth.set(handle.providerId, handle);
  }

  private serializeOAuthHandle(handle: ProviderAuthHandle): string {
    return this.secretBox.encrypt(
      JSON.stringify({
        accessToken: handle.accessToken,
        refreshToken: handle.refreshToken,
        tokenType: handle.tokenType,
        scopes: handle.scopes
      })
    );
  }

  private persistOAuthHandle(handle: ProviderAuthHandle): void {
    this.db.upsertOauthAccount(
      handle.providerId,
      handle.accountId,
      this.serializeOAuthHandle(handle),
      handle.expiresAt
    );
    this.auth.set(handle.providerId, handle);
  }

  private isOAuthAuthHandle(auth: ApiKeyAuth | ProviderAuthHandle): auth is ProviderAuthHandle {
    return "accountId" in auth;
  }

  private isOAuthRefreshDue(auth: ProviderAuthHandle): boolean {
    if (!auth.expiresAt) {
      return false;
    }
    const expiresAtMs = new Date(auth.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      return false;
    }
    return expiresAtMs <= Date.now() + 5 * 60_000;
  }

  private isUnauthorizedProviderError(error: unknown): boolean {
    if (typeof error === "object" && error !== null) {
      const maybeStatus = (error as { status?: unknown }).status;
      if (maybeStatus === 401) {
        return true;
      }
    }
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      message.includes("401") ||
      message.includes("unauthorized") ||
      message.includes("invalid api key") ||
      message.includes("invalid_api_key") ||
      message.includes("authentication")
    );
  }

  private async maybeRefreshOAuthAuth(
    provider: ProviderAdapter,
    auth: ProviderAuthHandle,
    forceRefresh: boolean
  ): Promise<ProviderAuthHandle> {
    if (!provider.refreshOAuthAuth) {
      return auth;
    }
    if (!forceRefresh && !this.isOAuthRefreshDue(auth)) {
      return auth;
    }
    const refreshed = await provider.refreshOAuthAuth(auth);
    if (!refreshed.accessToken) {
      throw new Error(`OAuth refresh for provider ${provider.id()} did not return access token`);
    }
    this.persistOAuthHandle(refreshed);
    return refreshed;
  }

  private async resolveProviderAuth(
    provider: ProviderAdapter,
    forceRefresh = false
  ): Promise<ApiKeyAuth | ProviderAuthHandle> {
    const current = this.auth.get(provider.id());
    if (!current) {
      throw new Error(`Missing authentication for provider ${provider.id()}`);
    }
    if (!this.isOAuthAuthHandle(current)) {
      return current;
    }
    return this.maybeRefreshOAuthAuth(provider, current, forceRefresh);
  }

  private async chatWithProvider(
    provider: ProviderAdapter,
    request: ChatRequest
  ): Promise<ChatResponse> {
    const auth = await this.resolveProviderAuth(provider);
    try {
      return await provider.chat(request, auth);
    } catch (error) {
      if (
        !this.isOAuthAuthHandle(auth) ||
        !provider.refreshOAuthAuth ||
        !this.isUnauthorizedProviderError(error)
      ) {
        throw error;
      }
      const refreshed = await this.resolveProviderAuth(provider, true);
      return provider.chat(request, refreshed);
    }
  }

  async startOAuthLogin(
    providerId: string,
    accountId: string,
    redirectUri: string,
    scopes: string[] = []
  ): Promise<OAuthStartResult & { providerId: string; accountId: string }> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    if (!provider.startOAuthLogin || !provider.completeOAuthLogin) {
      throw new Error(
        `Provider ${providerId} does not support OAuth in this deployment. Use API key mode.`
      );
    }

    const state = randomToken(24);
    const verifier = randomToken(32);
    const challenge = pkceChallenge(verifier);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const configuredProvider = this.config.providers.find((item) => item.id === providerId);
    const providerScopes =
      configuredProvider && "oauth" in configuredProvider
        ? configuredProvider.oauth?.scopes ?? []
        : [];

    const start = await provider.startOAuthLogin({
      accountId,
      redirectUri,
      state,
      scopes: scopes.length > 0 ? scopes : providerScopes,
      codeChallenge: challenge,
      codeChallengeMethod: "S256"
    });

    this.db.purgeExpiredOauthFlows();
    this.db.createOauthFlow({
      state,
      providerId,
      accountId,
      redirectUri,
      codeVerifier: `enc:${this.secretBox.encrypt(verifier)}`,
      expiresAt
    });

    return {
      ...start,
      state,
      expiresAt: start.expiresAt ?? expiresAt,
      providerId,
      accountId
    };
  }

  async completeOAuthLogin(
    providerId: string,
    state: string,
    code: string
  ): Promise<{ providerId: string; accountId: string; expiresAt?: string; scopes?: string[] }> {
    if (state.trim().length === 0) {
      throw new Error("OAuth state is required");
    }
    if (code.trim().length === 0) {
      throw new Error("OAuth code is required");
    }

    const flow = this.db.consumeOauthFlow(state);
    if (!flow) {
      throw new Error("OAuth flow state not found or already consumed");
    }
    if (flow.providerId !== providerId) {
      throw new Error("OAuth flow provider mismatch");
    }
    if (new Date(flow.expiresAt).getTime() < Date.now()) {
      throw new Error("OAuth flow expired. Start login again.");
    }

    const provider = this.providers.get(providerId);
    if (!provider || !provider.completeOAuthLogin) {
      throw new Error(`Provider ${providerId} does not support OAuth completion.`);
    }

    const handle = await provider.completeOAuthLogin({
      accountId: flow.accountId,
      code,
      state,
      redirectUri: flow.redirectUri,
      codeVerifier: this.resolveOauthCodeVerifier(flow.codeVerifier)
    });

    if (!handle.accessToken) {
      throw new Error("OAuth completion did not return access token");
    }

    this.persistOAuthHandle(handle);

    return {
      providerId,
      accountId: handle.accountId,
      expiresAt: handle.expiresAt,
      scopes: handle.scopes
    };
  }

  listOAuthAccounts(providerId?: string): Array<{
    providerId: string;
    accountId: string;
    expiresAt?: string;
    updatedAt: string;
  }> {
    return this.db.listOauthAccounts(providerId).map((row) => ({
      providerId: row.providerId,
      accountId: row.accountId,
      expiresAt: row.expiresAt,
      updatedAt: row.updatedAt
    }));
  }

  removeOAuthAccount(providerId: string, accountId: string): boolean {
    const removed = this.db.deleteOauthAccount(providerId, accountId);
    const current = this.auth.get(providerId);
    if (removed && current && "accountId" in current && current.accountId === accountId) {
      const fallback = this.apiKeyAuth.get(providerId);
      if (fallback) {
        this.auth.set(providerId, fallback);
      } else {
        this.auth.delete(providerId);
      }
    }
    return removed;
  }

  getEffectiveTimezone(): string {
    return this.effectiveTimezone;
  }

  private refreshEffectiveTimezone(): void {
    const confirmed = this.db.getSetting<{ timezone?: string }>(CONFIRMED_TIMEZONE_SETTING_KEY);
    const timezone =
      confirmed?.timezone ??
      this.config.time.defaultTimezone ??
      detectSystemTimezoneCandidate();
    this.effectiveTimezone = timezone;
  }

  isTimezoneConfirmed(): boolean {
    const confirmed = this.db.getSetting<{ timezone?: string }>(CONFIRMED_TIMEZONE_SETTING_KEY);
    if (!confirmed?.timezone) {
      return false;
    }
    return confirmed.timezone === this.effectiveTimezone;
  }

  confirmTimezone(timezone: string): { timezone: string; confirmed: boolean } {
    if (!validateTimezone(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    this.db.setSetting(CONFIRMED_TIMEZONE_SETTING_KEY, { timezone });
    this.effectiveTimezone = timezone;

    if (this.startedAt && this.config.scheduler.enabled) {
      this.schedulerWorker.start();
    }

    return {
      timezone: this.effectiveTimezone,
      confirmed: true
    };
  }

  getTimeStatus(): TimeStatus {
    this.refreshEffectiveTimezone();
    return this.clockHealthMonitor.getTimeStatus();
  }

  getSchedulerStatus(): {
    running: boolean;
    blockedReason?: string;
    lastTickAt?: string;
    lastHeartbeatAt?: string;
    enqueuedInLastTick: number;
    enabled: boolean;
    taskCount: number;
    timezone: string;
  } {
    const status = this.schedulerWorker.getStatus();
    const blockedReason =
      this.config.scheduler.enabled &&
      this.config.time.requireTimezoneConfirmation &&
      !this.isTimezoneConfirmed()
        ? "timezone confirmation required"
        : status.blockedReason;
    return {
      ...status,
      blockedReason,
      enabled: this.config.scheduler.enabled,
      taskCount: this.config.scheduler.tasks.length,
      timezone: this.effectiveTimezone
    };
  }

  listSchedulerTasks(): Array<{
    id: string;
    enabled: boolean;
    scheduleKind: "cron" | "interval";
    timezone: string;
    misfirePolicy: MisfirePolicy;
    nextRunAt?: string;
    lastRun?: {
      id: number;
      scheduledFor: string;
      startedAt: string;
      finishedAt?: string;
      status: "running" | "succeeded" | "failed";
    };
  }> {
    return this.schedulerWorker.listTaskStatuses();
  }

  enqueueScheduledTaskNow(taskId: string): boolean {
    return this.schedulerWorker.enqueueManualRun(taskId);
  }

  private assistantConfig(): {
    name: string;
    persona: string;
    operatorPreferences: string;
    promptOnFirstContact: boolean;
  } {
    const global = this.getGlobalAssistantProfile();
    const defaults = {
      ...DEFAULT_ASSISTANT_CONFIG,
      ...(this.config.assistant ?? {})
    };
    return {
      ...global,
      promptOnFirstContact: defaults.promptOnFirstContact
    };
  }

  private rebuildRuntimeTools(): void {
    const fsToolsConfig = this.config.tools?.fs ?? DEFAULT_FS_TOOLS;
    const execToolsConfig = this.config.tools?.exec ?? DEFAULT_EXEC_TOOLS;
    const pkgToolsConfig = this.config.tools?.pkg ?? DEFAULT_PKG_TOOLS;
    const webToolsConfig = this.config.tools?.web ?? DEFAULT_WEB_TOOLS;

    this.execTool = new ExecTool({
      policyEngine: this.policyEngine,
      logger: this.logger,
      defaultTimeoutMs: execToolsConfig.defaultTimeoutMs,
      guardrails: {
        mode: execToolsConfig.guardrails.mode,
        extraBlockedPatterns: execToolsConfig.guardrails.extraBlockedPatterns
      }
    });

    this.fsTool = new FsTool({
      policyEngine: this.policyEngine,
      logger: this.logger,
      workspaceRoot: this.config.workspaceRoot,
      workspaceOnly: fsToolsConfig.workspaceOnly,
      allowedReadPaths: fsToolsConfig.allowedReadPaths,
      allowedWritePaths: fsToolsConfig.allowedWritePaths
    });

    this.pkgTool = new PackageInstallTool({
      policyEngine: this.policyEngine,
      logger: this.logger,
      enabled: pkgToolsConfig.enabled,
      preferStructuredInstall: pkgToolsConfig.preferStructuredInstall,
      allowExecFallback: pkgToolsConfig.allowExecFallback,
      sudoNonInteractive: pkgToolsConfig.sudoNonInteractive,
      allowedManagers: pkgToolsConfig.allowedManagers
    });

    this.webTool = new WebTool({
      policyEngine: this.policyEngine,
      logger: this.logger,
      config: webToolsConfig
    });

    this.toolRouter = new RuntimeToolRouter({
      execTool: this.execTool,
      fsTool: this.fsTool,
      pkgTool: this.pkgTool,
      webTool: this.webTool,
      logger: this.logger
    });
  }

  private getGlobalAssistantProfile(): GlobalAssistantProfile {
    const defaults = {
      ...DEFAULT_ASSISTANT_CONFIG,
      ...(this.config.assistant ?? {})
    };
    const stored = this.db.getSetting<Partial<GlobalAssistantProfile>>(
      GLOBAL_ASSISTANT_PROFILE_SETTING_KEY
    );
    return {
      name: stored?.name?.trim() ? stored.name.trim() : defaults.name,
      persona: stored?.persona?.trim() ? stored.persona.trim() : defaults.persona,
      operatorPreferences: stored?.operatorPreferences?.trim()
        ? stored.operatorPreferences.trim()
        : defaults.operatorPreferences
    };
  }

  private setGlobalAssistantProfile(profile: GlobalAssistantProfile): void {
    this.db.setSetting(GLOBAL_ASSISTANT_PROFILE_SETTING_KEY, profile);
  }

  private ensureGlobalAssistantProfile(): GlobalAssistantProfile {
    const profile = this.getGlobalAssistantProfile();
    this.setGlobalAssistantProfile(profile);
    return profile;
  }

  private getGlobalAssistantProfileLock(): GlobalAssistantProfileLock {
    const stored = this.db.getSetting<Partial<GlobalAssistantProfileLock>>(
      GLOBAL_ASSISTANT_PROFILE_LOCK_SETTING_KEY
    );
    const lockedAt = stored?.lockedAt?.trim() ? stored.lockedAt : new Date().toISOString();
    return {
      locked: stored?.locked !== false,
      lockMode: "first-boot-lock-in",
      lockedAt,
      lastForcedUpdateAt: stored?.lastForcedUpdateAt
    };
  }

  private setGlobalAssistantProfileLock(lock: GlobalAssistantProfileLock): void {
    this.db.setSetting(GLOBAL_ASSISTANT_PROFILE_LOCK_SETTING_KEY, lock);
  }

  private ensureGlobalAssistantProfileLock(): GlobalAssistantProfileLock {
    const lock = this.getGlobalAssistantProfileLock();
    this.setGlobalAssistantProfileLock(lock);
    return lock;
  }

  getToolsStatus(sessionId?: string, actorId?: string): Promise<{
    enabledTools: string[];
    configuredTools: string[];
    autonomyMode: "full-root-auto";
    guardrailsMode: "minimal" | "off" | "strict";
    profile: PolicyProfile;
    profileSource: EffectivePolicySource;
    packageTool: ReturnType<PackageInstallTool["getStatus"]>;
    webTool: ReturnType<WebTool["getStatus"]>;
    awareness: string;
  }> {
    return this.policyEngine.resolveProfile({
      sessionId: sessionId ?? "__default__",
      actorId
    }).then((resolution) => {
      const enabled = this.enabledToolSchemas();
      const callableTools =
        resolution.profile === "full-root" ? enabled.map((item) => item.name) : [];
      const conversationKey = sessionId ? conversationKeyFromSessionId(sessionId) : "__status__";
      const awareness = summarizeRuntimeAwareness(
        this.buildAwarenessSnapshot(sessionId ?? "__default__", conversationKey, resolution)
      );
      return {
        enabledTools: callableTools,
        configuredTools: enabled.map((item) => item.name),
        autonomyMode: "full-root-auto",
        guardrailsMode: this.config.tools?.exec.guardrails.mode ?? "minimal",
        profile: resolution.profile,
        profileSource: resolution.source,
        packageTool: this.pkgTool.getStatus(),
        webTool: this.webTool.getStatus(),
        awareness
      };
    });
  }

  async listInstalledSkills(): Promise<SkillManifest[]> {
    const installed = this.listInstalledSkillsSync();
    this.syncManagedSkills(installed);
    return installed;
  }

  async installSkillFromPath(sourcePath: string): Promise<SkillManifest> {
    const manifestPath = path.join(path.resolve(sourcePath), "openassist.skill.json");
    const manifestRaw = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
    const manifest = validateSkillManifest(manifestRaw);
    await this.skillRuntime.installFromPath(sourcePath);
    this.db.registerSkill(manifest.id, manifest.version, manifest as unknown as Record<string, unknown>);
    this.db.upsertManagedCapability({
      kind: "skill",
      id: manifest.id,
      installRoot: path.join(this.config.paths.skillsDir, manifest.id),
      installer: "skill-path-copy",
      summary: manifest.description,
      updateSafe: true
    });
    const installed = await this.skillRuntime.listInstalled();
    this.syncManagedSkills(installed);
    return manifest;
  }

  async registerManagedHelper(input: ManagedHelperRegistrationInput): Promise<ManagedCapabilityRecord> {
    const installRoot = path.resolve(input.installRoot);
    this.db.upsertManagedCapability({
      kind: "helper-tool",
      id: input.id,
      installRoot,
      installer: input.installer,
      summary: input.summary,
      updateSafe: this.isManagedPathUpdateSafe(installRoot)
    });
    const stored = this.db.getManagedCapability("helper-tool", input.id);
    if (!stored) {
      throw new Error(`Managed helper registration failed for ${input.id}`);
    }
    return stored;
  }

  async getGrowthStatus(sessionId?: string, actorId?: string): Promise<RuntimeGrowthStatus> {
    const resolution = await this.policyEngine.resolveProfile({
      sessionId: sessionId ?? "__default__",
      actorId
    });
    const installedSkills = await this.listInstalledSkills();
    const managedHelpers = this.db.listManagedCapabilities("helper-tool");
    const fullRootCanGrowNow =
      resolution.profile === "full-root" &&
      this.enabledToolSchemas().some((item) => item.name === "fs.write") &&
      (this.enabledToolSchemas().some((item) => item.name === "pkg.install") ||
        this.enabledToolSchemas().some((item) => item.name === "exec.run"));

    return {
      defaultMode: "extensions-first",
      fullRootCanGrowNow,
      profile: resolution.profile,
      profileSource: resolution.source,
      updateSafetyNote:
        "Managed skills and helper tools live under runtime-owned paths and are intended to survive normal updates more predictably than direct repo edits. Repo mutation remains possible in full access, but it is advanced and less update-safe.",
      skillsDirectory: path.resolve(this.config.paths.skillsDir),
      helperToolsDirectory: this.managedHelperToolsDir(),
      installedSkills,
      managedHelpers
    };
  }

  listToolInvocations(sessionId?: string, limit = 50): ReturnType<OpenAssistDatabase["listToolInvocations"]> {
    return this.db.listToolInvocations(sessionId, limit);
  }

  async setPolicyProfile(sessionId: string, profile: PolicyProfile, actorId?: string): Promise<void> {
    await this.policyEngine.setProfile(sessionId, profile, actorId);
  }

  async start(): Promise<void> {
    if (this.startedAt) {
      return;
    }

    this.startedAt = new Date().toISOString();
    const epoch = ++this.startupEpoch;
    this.refreshEffectiveTimezone();
    this.loadStoredOauthAccounts();
    this.ensureGlobalAssistantProfile();
    this.ensureGlobalAssistantProfileLock();
    this.syncManagedSkills(this.listInstalledSkillsSync());

    const clockResult = await this.clockHealthMonitor.ensureStartupCheck();
    if (this.config.time.ntpPolicy === "hard-fail" && clockResult.status === "unhealthy") {
      throw new Error("Clock/NTP health check failed and policy is hard-fail");
    }
    await this.clockHealthMonitor.start();

    for (const [channelId, channel] of this.channels.entries()) {
      this.launchChannelStartup(channelId, channel, epoch);
    }

    this.recoveryWorker.start();
    this.db.updateModuleHealth("recovery", "healthy", "running");

    if (this.config.scheduler.enabled) {
      if (this.config.time.requireTimezoneConfirmation && !this.isTimezoneConfirmed()) {
        this.db.updateModuleHealth("scheduler", "degraded", "timezone confirmation required");
      } else {
        this.schedulerWorker.start();
      }
    } else {
      this.db.updateModuleHealth("scheduler", "degraded", "scheduler disabled in config");
    }
  }

  private loadStoredOauthAccounts(): void {
    const rows = this.db.listOauthAccounts();
    for (const row of rows) {
      const current = this.auth.get(row.providerId);
      if (current && !this.isOAuthAuthHandle(current)) {
        continue;
      }
      try {
        const decrypted = this.secretBox.decrypt(row.encryptedSecretJson);
        const parsed = JSON.parse(decrypted) as {
          accessToken?: string;
          refreshToken?: string;
          tokenType?: string;
          scopes?: string[];
        };

        if (!parsed.accessToken && !parsed.refreshToken) {
          continue;
        }
        if (
          row.expiresAt &&
          new Date(row.expiresAt).getTime() < Date.now() &&
          !parsed.refreshToken
        ) {
          continue;
        }

        this.auth.set(row.providerId, {
          providerId: row.providerId,
          accountId: row.accountId,
          ...(parsed.accessToken ? { accessToken: parsed.accessToken } : {}),
          refreshToken: parsed.refreshToken,
          tokenType: parsed.tokenType,
          scopes: parsed.scopes,
          expiresAt: row.expiresAt
        });
      } catch (error) {
        this.logger.warn(
          { providerId: row.providerId, accountId: row.accountId, error },
          "failed to load stored oauth account"
        );
      }
    }
  }

  async stop(): Promise<void> {
    this.startupEpoch += 1;
    this.schedulerWorker.stop();
    this.clockHealthMonitor.stop();
    this.recoveryWorker.stop();

    for (const [channelId, channel] of this.channels.entries()) {
      try {
        await channel.stop();
      } catch (error) {
        this.logger.warn({ channelId, error }, "channel adapter stop failed");
      } finally {
        this.db.updateModuleHealth(channelId, "unhealthy", "stopped");
      }
    }

    this.db.updateModuleHealth("recovery", "unhealthy", "stopped");
    this.db.updateModuleHealth("time-sync", "unhealthy", "stopped");
    this.startedAt = null;
  }

  private isCurrentStartup(epoch: number): boolean {
    return this.startedAt !== null && this.startupEpoch === epoch;
  }

  private launchChannelStartup(channelId: string, channel: ChannelAdapter, epoch: number): void {
    this.db.updateModuleHealth(channelId, "healthy", "starting");
    void (async () => {
      try {
        await channel.start(async (message) => {
          await this.handleInbound(message);
        });
        if (this.isCurrentStartup(epoch)) {
          this.db.updateModuleHealth(channelId, "healthy", "running");
        }
      } catch (error) {
        if (!this.isCurrentStartup(epoch)) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error({ channelId, error }, "channel adapter failed to start; keeping runtime online");
        this.db.updateModuleHealth(channelId, "degraded", `failed to start: ${message}`);
      }
    })();
  }

  getStatus(): RuntimeStatus {
    const moduleRows = this.db.getModuleHealth();
    const modules: Record<string, "starting" | "running" | "stopped" | "degraded"> = {};

    for (const module of moduleRows) {
      modules[module.moduleId] =
        module.status === "healthy"
          ? "running"
          : module.status === "degraded"
            ? "degraded"
            : "stopped";
    }

    return {
      startedAt: this.startedAt ?? new Date(0).toISOString(),
      modules
    };
  }

  async applyConfigCandidate(nextConfig: RuntimeConfig): Promise<void> {
    const generation = this.db.createConfigGeneration(nextConfig as unknown as Record<string, unknown>);

    try {
      for (const provider of this.providers.values()) {
        const result = await provider.validateConfig({
          id: provider.id(),
          defaultModel: nextConfig.providers.find((item) => item.id === provider.id())?.defaultModel
        });
        if (!result.valid) {
          throw new Error(`Provider ${provider.id()} validation failed: ${result.errors.join("; ")}`);
        }
      }

      for (const channel of this.channels.values()) {
        const result = await channel.validateConfig({ id: channel.id() });
        if (!result.valid) {
          throw new Error(`Channel ${channel.id()} validation failed: ${result.errors.join("; ")}`);
        }
      }

      this.config = nextConfig;
      this.refreshEffectiveTimezone();
      this.hostSystemProfile.workspaceRoot = nextConfig.workspaceRoot;
      this.policyEngine.updateConfig({
        defaultProfile: nextConfig.defaultPolicyProfile,
        operatorAccessProfile: nextConfig.operatorAccessProfile ?? "operator",
        channels: nextConfig.channels
      });
      this.channelTypes.clear();
      for (const channelConfig of nextConfig.channels) {
        this.channelTypes.set(channelConfig.id, channelConfig.type);
      }
      this.rebuildRuntimeTools();

      if (!nextConfig.scheduler.enabled) {
        this.schedulerWorker.stop();
      } else if (
        this.startedAt &&
        (!nextConfig.time.requireTimezoneConfirmation || this.isTimezoneConfirmed())
      ) {
        this.schedulerWorker.start();
      }

      this.db.activateConfigGeneration(generation.generation);
    } catch (error) {
      this.db.rollbackConfigGeneration(generation.generation);
      throw error;
    }
  }

  async handleInbound(envelope: InboundEnvelope): Promise<void> {
    const sessionId = sessionIdFromEnvelope(envelope);
    const commandText = envelope.text;
    if (this.db.hasIdempotencyKey(envelope.idempotencyKey)) {
      this.logger.info(redactSensitiveData({ envelope }), "duplicate inbound message ignored");
      return;
    }
    const preparedInbound = await this.prepareInboundEnvelope(envelope);
    const accepted = this.db.recordInbound(sessionId, preparedInbound.envelope);
    if (!accepted) {
      await this.cleanupPreparedAttachments(preparedInbound.envelope.attachments ?? []);
      this.logger.info(redactSensitiveData({ envelope: preparedInbound.envelope }), "duplicate inbound message ignored");
      return;
    }

    const channel = this.channels.get(preparedInbound.envelope.channelId);
    if (!channel) {
      throw new Error(`No channel adapter found for id ${preparedInbound.envelope.channelId}`);
    }

    try {
      if (this.isWelcomeCommand(commandText)) {
        await this.handleWelcomeCommand(channel, preparedInbound.envelope, sessionId);
        return;
      }

      if (this.isCapabilitiesCommand(commandText)) {
        await this.handleCapabilitiesCommand(channel, preparedInbound.envelope, sessionId);
        return;
      }

      if (this.isGrowCommand(commandText)) {
        await this.handleGrowCommand(channel, preparedInbound.envelope, sessionId);
        return;
      }

      if (this.isOperationalStatusRequest(commandText)) {
        const statusText = sanitizeUserOutput(
          await this.buildOperationalStatusMessage(sessionId, preparedInbound.envelope.senderId)
        );
        this.db.recordAssistantMessage(sessionId, preparedInbound.envelope.conversationKey, {
          role: "assistant",
          content: statusText
        }, {
          providerId: "runtime-status",
          source: "runtime.status"
        });
        await this.sendOutboundWithRetry(channel, sessionId, {
          channel: preparedInbound.envelope.channel,
          conversationKey: preparedInbound.envelope.conversationKey,
          text: statusText,
          replyToTransportMessageId: preparedInbound.envelope.transportMessageId,
          metadata: {
            source: "runtime-status"
          }
        });
        return;
      }

      if (this.isProfileCommand(commandText)) {
        await this.handleProfileCommand(channel, preparedInbound.envelope, sessionId);
        return;
      }

      if (this.isAccessCommand(commandText)) {
        await this.handleAccessCommand(channel, preparedInbound.envelope, sessionId);
        return;
      }

      const profileResolution = await this.policyEngine.resolveProfile({
        sessionId,
        actorId: preparedInbound.envelope.senderId
      });
      const sessionBootstrap = this.ensureSessionBootstrap(
        sessionId,
        preparedInbound.envelope.conversationKey,
        profileResolution
      );
      if (this.shouldSendFirstContactPrompt(commandText, sessionBootstrap)) {
        const prompt = sanitizeUserOutput(this.buildFirstContactPrompt(sessionBootstrap));
        this.db.recordAssistantMessage(
          sessionId,
          preparedInbound.envelope.conversationKey,
          {
            role: "assistant",
            content: prompt
          },
          {
            providerId: "runtime.profile",
            source: "runtime.profile.prompt"
          }
        );
        this.db.markSessionBootstrapPrompted(sessionId);

        await this.sendOutboundWithRetry(channel, sessionId, {
          channel: preparedInbound.envelope.channel,
          conversationKey: preparedInbound.envelope.conversationKey,
          text: prompt,
          replyToTransportMessageId: preparedInbound.envelope.transportMessageId,
          metadata: {
            source: "runtime-profile-prompt"
          }
        });
        return;
      }

      const provider = this.providers.get(this.config.defaultProviderId);
      if (!provider) {
        throw new Error(`Default provider ${this.config.defaultProviderId} not found`);
      }

      const model =
        this.config.providers.find((candidate) => candidate.id === provider.id())?.defaultModel ??
        "unknown";
      const actorId = preparedInbound.envelope.senderId;
      const toolSchemas = await this.resolveToolSchemasForSession(sessionId, actorId);
      const recentMessages = this.db.getRecentMessages(sessionId, 50);
      const planned = this.contextPlanner.plan(defaultSystemPrompt(), recentMessages);
      let conversationMessages: NormalizedMessage[] = [...planned.messages];
      conversationMessages.splice(1, 0, this.buildSessionBootstrapSystemMessage(sessionBootstrap));
      const providerInputNotes = this.buildProviderInputNotes(provider, preparedInbound.envelope);
      if (providerInputNotes.length > 0) {
        conversationMessages.splice(2, 0, {
          role: "system",
          content: providerInputNotes.join("\n")
        });
      }

      if (planned.snapshotWritten) {
        this.db.recordAssistantMessage(sessionId, preparedInbound.envelope.conversationKey, {
          role: "assistant",
          content: "[state_snapshot_written]",
          metadata: {
            system: "true",
            estimatedTokens: String(planned.estimatedTokens)
          }
        });
      }

      let responseText = "";
      let responseUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      let finalFinishReason: string | undefined;
      let finalResponseId: string | undefined;
      let finalResponseMetadata: Record<string, string> | undefined;
      let finalResolved = false;

      for (let round = 0; round < DEFAULT_MAX_TOOL_ROUNDS; round += 1) {
        conversationMessages = this.reconcileToolConversationForProvider(
          conversationMessages,
          sessionId,
          envelope.conversationKey
        );

        const response = await this.chatWithProvider(
          provider,
          {
            sessionId,
            model,
            messages: conversationMessages,
            tools: toolSchemas,
            metadata: {
              channel: preparedInbound.envelope.channel,
              channelId: preparedInbound.envelope.channelId,
              senderId: preparedInbound.envelope.senderId,
              toolRound: String(round)
            }
          }
        );

        responseUsage = response.usage;
        finalFinishReason = response.finishReason;
        finalResponseId = response.rawProviderResponseId;
        finalResponseMetadata = response.output.metadata;

        const toolCalls = response.toolCalls ?? [];
        if (toolCalls.length > 0 && toolSchemas.length === 0) {
          this.logger.warn(
            {
              type: "tool.call.ignored",
              sessionId,
              conversationKey: preparedInbound.envelope.conversationKey,
              profile: profileResolution.profile,
              providerId: provider.id(),
              toolCallCount: toolCalls.length
            },
            "provider returned tool calls while autonomous tools are disabled for this session"
          );

          responseText =
            response.output.content.trim().length > 0
              ? response.output.content
              : "Autonomous tool execution is disabled for this session profile.";
          finalResolved = true;
          break;
        }

        if (toolCalls.length === 0) {
          responseText = response.output.content;
          finalResolved = true;
          break;
        }

        for (const [toolCallIndex, toolCall] of toolCalls.entries()) {
          const assistantToolCallMessage: NormalizedMessage = {
            role: "assistant",
            content: "",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            metadata: {
              toolArgumentsJson: toolCall.argumentsJson,
              ...(toolCallIndex === 0 ? (response.output.metadata ?? {}) : {})
            }
          };
          conversationMessages.push(assistantToolCallMessage);
          this.db.recordAssistantMessage(sessionId, preparedInbound.envelope.conversationKey, assistantToolCallMessage, {
            providerId: provider.id(),
            toolCallId: toolCall.id,
            toolName: toolCall.name
          });

          const execution = await this.executeToolCallWithAudit(
            sessionId,
            preparedInbound.envelope.conversationKey,
            actorId,
            toolCall
          );
          const toolMessage: NormalizedMessage = {
            role: "tool",
            content: execution.message.content,
            toolCallId: execution.message.toolCallId,
            toolName: execution.message.name,
            metadata: {
              isError: String(execution.message.isError)
            }
          };
          conversationMessages.push(toolMessage);
          this.db.recordAssistantMessage(sessionId, preparedInbound.envelope.conversationKey, toolMessage, {
            providerId: provider.id(),
            toolCallId: execution.message.toolCallId,
            toolName: execution.message.name,
            toolStatus: execution.status
          });
        }
      }

      if (!finalResolved) {
        responseText =
          "Tool execution reached the maximum round limit for this message. Narrow the request and try again.";
      }

      const safeText = sanitizeUserOutput(
        this.appendOutboundNotes(responseText, [
          ...preparedInbound.notes,
          ...this.buildProviderVisibilityNotes(provider, preparedInbound.envelope)
        ])
      );
      this.db.recordAssistantMessage(
        sessionId,
        preparedInbound.envelope.conversationKey,
        {
          role: "assistant",
          content: safeText,
          internalTrace: undefined,
          metadata: finalResponseMetadata
        },
        {
          providerId: provider.id(),
          totalTokens: String(responseUsage.totalTokens),
          finishReason: finalFinishReason ?? "",
          responseId: finalResponseId ?? ""
        }
      );

      await this.sendOutboundWithRetry(channel, sessionId, {
        channel: preparedInbound.envelope.channel,
        conversationKey: preparedInbound.envelope.conversationKey,
        text: safeText,
        replyToTransportMessageId: preparedInbound.envelope.transportMessageId,
        metadata: {
          providerId: provider.id()
        }
      });
    } catch (error) {
      const errText = error instanceof Error ? error.message : String(error);
      const providerHint = this.classifyOperationalError(errText);
      this.logger.error(
        redactSensitiveData({
          sessionId,
          conversationKey: preparedInbound.envelope.conversationKey,
          channel: preparedInbound.envelope.channel,
          error: errText
        }),
        "inbound processing failed"
      );
      this.db.updateModuleHealth("runtime", "degraded", providerHint);

      const diagnosticText = sanitizeUserOutput(
        [
          "OpenAssist could not complete that request with the configured provider.",
          `Reason: ${providerHint}`,
          "Chat command: send '/status' for local runtime diagnostics.",
          "Operator checks: openassist auth status, openassist channel status, openassist service health."
        ].join("\n")
      );

      this.db.recordAssistantMessage(
        sessionId,
        preparedInbound.envelope.conversationKey,
        {
          role: "assistant",
          content: diagnosticText
        },
        {
          providerId: this.config.defaultProviderId,
          source: "runtime.diagnostic"
        }
      );

      await this.sendOutboundWithRetry(channel, sessionId, {
        channel: preparedInbound.envelope.channel,
        conversationKey: preparedInbound.envelope.conversationKey,
        text: diagnosticText,
        replyToTransportMessageId: preparedInbound.envelope.transportMessageId,
        metadata: {
          source: "runtime-diagnostic",
          providerId: this.config.defaultProviderId
        }
      });
    }
  }

  private async sendOutboundWithRetry(
    channel: ChannelAdapter,
    sessionId: string,
    outbound: OutboundEnvelope
  ): Promise<void> {
    for (const rendered of renderOutboundEnvelope(outbound)) {
      try {
        const sent = await channel.send(rendered);
        this.db.recordOutbound(sessionId, rendered, sent.transportMessageId);
      } catch (error) {
        const errText = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          redactSensitiveData({ errText, outbound: rendered }),
          "outbound send failed, enqueuing retry job"
        );
        this.recoveryWorker.enqueue(
          "send_outbound",
          {
            channelId: channel.id(),
            sessionId,
            envelope: rendered
          },
          {
            maxAttempts: 5,
            initialDelayMs: 1000,
            maxDelayMs: 60000
          }
        );
      }
    }
  }

  private attachmentStorageDir(envelope: InboundEnvelope): string {
    return path.join(
      this.config.paths.dataDir,
      "attachments",
      envelope.channelId,
      encodePathSegment(envelope.conversationKey),
      encodePathSegment(envelope.transportMessageId)
    );
  }

  private async prepareInboundEnvelope(
    envelope: InboundEnvelope
  ): Promise<{ envelope: InboundEnvelope; notes: string[] }> {
    const ingested = await ingestInboundAttachments({
      attachmentsConfig: this.config.attachments,
      attachmentsDir: this.attachmentStorageDir(envelope),
      envelope,
      logger: this.logger
    });

    return {
      envelope: {
        ...envelope,
        text: ingested.content,
        attachments: ingested.attachments
      },
      notes: ingested.notes
    };
  }

  private async cleanupPreparedAttachments(attachments: AttachmentRef[]): Promise<void> {
    for (const attachment of attachments) {
      if (!attachment.localPath) {
        continue;
      }

      try {
        await fs.promises.rm(attachment.localPath, { force: true });
      } catch {
        // Best-effort duplicate cleanup only.
      }
    }
  }

  private buildProviderInputNotes(
    provider: ProviderAdapter,
    envelope: InboundEnvelope
  ): string[] {
    const imageCount = envelope.attachments.filter((attachment) => attachment.kind === "image").length;
    if (imageCount === 0 || provider.capabilities().supportsImageInputs) {
      return [];
    }

    return [
      `Provider constraint: ${provider.id()} cannot inspect image binaries in this session.`,
      "Only the user's text, captions, attachment summaries, and extracted text from supported documents are available."
    ];
  }

  private buildProviderVisibilityNotes(
    provider: ProviderAdapter,
    envelope: InboundEnvelope
  ): string[] {
    const imageCount = envelope.attachments.filter((attachment) => attachment.kind === "image").length;
    if (imageCount === 0 || provider.capabilities().supportsImageInputs) {
      return [];
    }

    return [
      `OpenAssist note: ${provider.id()} could not inspect the image binary for this reply, so only your text, captions, and extracted document text were used.`
    ];
  }

  private appendOutboundNotes(text: string, notes: string[]): string {
    const filteredNotes = notes.map((note) => note.trim()).filter((note) => note.length > 0);
    if (filteredNotes.length === 0) {
      return text;
    }

    const noteBlock = `OpenAssist notes:\n${filteredNotes.map((note) => `- ${note}`).join("\n")}`;
    const trimmed = text.trim();
    return trimmed.length > 0 ? `${trimmed}\n\n${noteBlock}` : noteBlock;
  }

  private async sendRuntimeCommandMessage(
    channel: ChannelAdapter,
    envelope: InboundEnvelope,
    sessionId: string,
    source: string,
    content: string
  ): Promise<void> {
    const text = sanitizeUserOutput(content);
    this.db.recordAssistantMessage(
      sessionId,
      envelope.conversationKey,
      {
        role: "assistant",
        content: text
      },
      {
        providerId: source,
        source
      }
    );

    await this.sendOutboundWithRetry(channel, sessionId, {
      channel: envelope.channel,
      conversationKey: envelope.conversationKey,
      text,
      replyToTransportMessageId: envelope.transportMessageId,
      metadata: {
        source
      }
    });
  }

  private isWelcomeCommand(text: string | undefined): boolean {
    const normalized = (text ?? "").trim().toLowerCase();
    return (
      normalized === SESSION_START_COMMAND_PREFIX ||
      normalized === "start" ||
      normalized === SESSION_HELP_COMMAND_PREFIX ||
      normalized === "help" ||
      normalized === "/openassist help"
    );
  }

  private isCapabilitiesCommand(text: string | undefined): boolean {
    const normalized = (text ?? "").trim().toLowerCase();
    return normalized === SESSION_CAPABILITIES_COMMAND_PREFIX || normalized === "capabilities";
  }

  private isGrowCommand(text: string | undefined): boolean {
    const normalized = (text ?? "").trim().toLowerCase();
    return normalized === SESSION_GROW_COMMAND_PREFIX || normalized === "grow";
  }

  private formatChannelSurfaceSummary(sessionId: string): string {
    const activeChannelId = channelIdFromSessionId(sessionId);
    const adapter = this.channels.get(activeChannelId);
    const channelType = this.channelTypes.get(activeChannelId) ?? "unknown";
    if (!adapter) {
      return `${activeChannelId}/${channelType}`;
    }

    const capabilities = adapter.capabilities();
    return `${activeChannelId}/${channelType} (formatted=${capabilities.supportsFormattedText ? "yes" : "no"}, images=${capabilities.supportsImageAttachments ? "yes" : "no"}, documents=${capabilities.supportsDocumentAttachments ? "yes" : "no"})`;
  }

  private async ensureSessionAwareness(
    sessionId: string,
    senderId: string
  ): Promise<{
    resolution: PolicyResolution;
    awareness: RuntimeAwarenessSnapshot;
  }> {
    const conversationKey = conversationKeyFromSessionId(sessionId);
    const resolution = await this.policyEngine.resolveProfile({
      sessionId,
      actorId: senderId
    });
    const bootstrap = this.ensureSessionBootstrap(sessionId, conversationKey, resolution);
    return {
      resolution,
      awareness:
        this.awarenessFromSystemProfile(bootstrap.systemProfile) ??
        this.buildAwarenessSnapshot(sessionId, conversationKey, resolution)
    };
  }

  private async buildWelcomeMessage(sessionId: string, senderId: string): Promise<string> {
    const toolsStatus = await this.getToolsStatus(sessionId, senderId);
    const { awareness } = await this.ensureSessionAwareness(sessionId, senderId);
    const assistant = this.assistantConfig();
    const visibleDomains = awareness.capabilityDomains.filter((domain) => domain.available).slice(0, 6);

    return [
      `Hi — I'm ${assistant.name} on this machine.`,
      "",
      "Current session",
      `- Host: ${awareness.host.hostname} (${awareness.host.platform}, ${awareness.host.arch})`,
      `- Chat surface: ${this.formatChannelSurfaceSummary(sessionId)}`,
      `- Provider: ${this.config.defaultProviderId}${this.providers.get(this.config.defaultProviderId)?.capabilities().supportsImageInputs ? " (supports image inputs)" : " (text-first provider for images)"}`,
      `- Access: ${describeAccessMode(toolsStatus.profile)}`,
      `- Tools available now: ${toolsStatus.enabledTools.join(", ") || "none"}`,
      "",
      "I can help with",
      ...visibleDomains.map((domain) => `- ${domain.label}: ${domain.reason}`),
      awareness.capabilityDomains.some((domain) => !domain.available)
        ? "- Some domains are limited in this session. Run /capabilities for the full live inventory."
        : "- Run /capabilities for the full live inventory and concrete examples.",
      "",
      "Try asking",
      '- "Check disk usage and clean up old logs"',
      '- "Read this document and summarize the key points"',
      '- "Research the latest docs for a package I use"',
      '- "Set up a recurring maintenance task"',
      '- "Show growth status and safe extension options"',
      '- "Run a safe OpenAssist update dry-run"',
      "",
      "Runtime commands",
      "- /status for diagnostics",
      "- /capabilities for the live capability inventory",
      "- /grow for managed skills, helper tools, and growth policy",
      "- /profile to view or update the main assistant identity"
    ].join("\n");
  }

  private async buildCapabilitiesMessage(sessionId: string, senderId: string): Promise<string> {
    const toolsStatus = await this.getToolsStatus(sessionId, senderId);
    const { awareness } = await this.ensureSessionAwareness(sessionId, senderId);

    return [
      "OpenAssist live capability inventory",
      `- sender id: ${senderId}`,
      `- session id: ${sessionId}`,
      `- provider: ${this.config.defaultProviderId}`,
      `- chat surface: ${this.formatChannelSurfaceSummary(sessionId)}`,
      `- access: ${describeAccessMode(toolsStatus.profile)}`,
      `- access source: ${describeAccessSource(toolsStatus.profileSource)}`,
      `- callable tools now: ${toolsStatus.enabledTools.join(", ") || "none"}`,
      "Capability domains",
      ...awareness.capabilityDomains.flatMap((domain) => [
        `- ${domain.label}: ${domain.available ? "available" : "limited"}. ${domain.reason}`,
        `- Examples: ${domain.exampleTasks.join("; ")}`
      ]),
      `- Local docs/config map: ${awareness.documentation.refs.map((ref) => ref.path).join(", ")}`,
      `- Growth mode: ${awareness.growth.defaultMode}; run /grow for managed skills and helper tooling`,
      `- Blocked reasons: ${awareness.capabilities.blockedReasons.join(" | ") || "none"}`
    ].join("\n");
  }

  private async buildGrowMessage(sessionId: string, senderId: string): Promise<string> {
    await this.ensureSessionAwareness(sessionId, senderId);
    const growthStatus = await this.getGrowthStatus(sessionId, senderId);
    const canManageAccess = this.policyEngine.isApprovedOperator(sessionId, senderId);
    const skillList =
      growthStatus.installedSkills.length > 0
        ? growthStatus.installedSkills
            .map((skill) => `${skill.id}@${skill.version}`)
            .join(", ")
        : "none yet";
    const helperList =
      growthStatus.managedHelpers.length > 0
        ? growthStatus.managedHelpers
            .map((helper) => `${helper.id} (${helper.installer}${helper.updateSafe ? ", update-safe" : ", advanced"})`)
            .join(", ")
        : "none yet";

    return [
      "OpenAssist controlled growth",
      `- Access now: ${describeAccessMode(growthStatus.profile)}`,
      `- Access source: ${describeAccessSource(growthStatus.profileSource)}`,
      `- Default growth mode: ${growthStatus.defaultMode}`,
      `- Growth actions available now: ${growthStatus.fullRootCanGrowNow ? "yes" : "no"}`,
      `- Installed skills: ${growthStatus.installedSkills.length} (${skillList})`,
      `- Managed helpers: ${growthStatus.managedHelpers.length} (${helperList})`,
      ...(canManageAccess
        ? [
            `- Skills directory: ${growthStatus.skillsDirectory}`,
            `- Helper tools directory: ${growthStatus.helperToolsDirectory}`
          ]
        : [
            "- Managed growth directories: hidden in chat for this sender; use 'openassist growth status' on the host for full paths."
          ]),
      `- Update safety: ${growthStatus.updateSafetyNote}`,
      "- Safe next actions:",
      `- Host-side install: openassist skills install --path "<skill-directory>"`,
      `- Host-side helper registration: openassist growth helper add --name <id> --root "<path>" --installer <kind> --summary "<text>"`,
      "- In full access chat, prefer managed skills and helper-tool directories over editing tracked repo files when the goal is durable growth.",
      "- Direct repo or config edits remain possible in full access, but that path is advanced and less update-safe."
    ].join("\n");
  }

  private async handleWelcomeCommand(
    channel: ChannelAdapter,
    envelope: InboundEnvelope,
    sessionId: string
  ): Promise<void> {
    await this.sendRuntimeCommandMessage(
      channel,
      envelope,
      sessionId,
      "runtime.welcome",
      await this.buildWelcomeMessage(sessionId, envelope.senderId)
    );
  }

  private async handleCapabilitiesCommand(
    channel: ChannelAdapter,
    envelope: InboundEnvelope,
    sessionId: string
  ): Promise<void> {
    await this.sendRuntimeCommandMessage(
      channel,
      envelope,
      sessionId,
      "runtime.capabilities",
      await this.buildCapabilitiesMessage(sessionId, envelope.senderId)
    );
  }

  private async handleGrowCommand(
    channel: ChannelAdapter,
    envelope: InboundEnvelope,
    sessionId: string
  ): Promise<void> {
    await this.sendRuntimeCommandMessage(
      channel,
      envelope,
      sessionId,
      "runtime.growth",
      await this.buildGrowMessage(sessionId, envelope.senderId)
    );
  }

  private isOperationalStatusRequest(text: string | undefined): boolean {
    const normalized = (text ?? "").trim().toLowerCase();
    return (
      normalized === "/status" ||
      normalized === "status" ||
      normalized === "/health" ||
      normalized === "health" ||
      normalized === "/openassist status"
    );
  }

  private classifyOperationalError(errorText: string): string {
    const normalized = errorText.toLowerCase();
    if (normalized.includes("missing authentication") || normalized.includes("api key")) {
      return "provider authentication is missing or invalid";
    }
    if (normalized.includes("default provider") && normalized.includes("not found")) {
      return "default provider is not configured in runtime";
    }
    if (normalized.includes("fetch failed") || normalized.includes("timeout") || normalized.includes("econn")) {
      return "provider network request failed";
    }
    if (normalized.includes("unauthorized") || normalized.includes("forbidden")) {
      return "provider rejected authentication or permissions";
    }
    return "provider/runtime request failed";
  }

  private isProfileCommand(text: string | undefined): boolean {
    const normalized = (text ?? "").trim().toLowerCase();
    return normalized === SESSION_PROFILE_COMMAND_PREFIX || normalized.startsWith(`${SESSION_PROFILE_COMMAND_PREFIX} `);
  }

  private isAccessCommand(text: string | undefined): boolean {
    const normalized = (text ?? "").trim().toLowerCase();
    return normalized === SESSION_ACCESS_COMMAND_PREFIX || normalized.startsWith(`${SESSION_ACCESS_COMMAND_PREFIX} `);
  }

  private buildAwarenessSnapshot(
    sessionId: string,
    conversationKey: string,
    resolution: PolicyResolution
  ): RuntimeAwarenessSnapshot {
    const activeChannelId = channelIdFromSessionId(sessionId);
    const activeChannelType = this.channelTypes.get(activeChannelId) ?? "unknown";
    const activeChannel = this.channels.get(activeChannelId);
    const provider = this.providers.get(this.config.defaultProviderId);
    const runtimeStatus = this.getStatus();
    const schedulerStatus = this.getSchedulerStatus();
    const modules = Object.entries(runtimeStatus.modules).map(
      ([moduleId, status]) => `${moduleId}=${status}`
    );
    const configuredToolNames = this.enabledToolSchemas().map((item) => item.name);
    const callableToolNames = resolution.profile === "full-root" ? configuredToolNames : [];
    const liveSkills = this.listInstalledSkillsSync();
    const managedHelpers = this.db.listManagedCapabilities("helper-tool");
    return buildRuntimeAwarenessSnapshot({
      sessionId,
      conversationKey,
      startedAt: this.startedAt,
      defaultProviderId: this.config.defaultProviderId,
      activeChannelId,
      activeChannelType,
      providerIds: Array.from(this.providers.keys()),
      channelIds: Array.from(this.channels.keys()),
      timezone: this.getEffectiveTimezone(),
      modules,
      host: {
        platform: String(this.hostSystemProfile.platform ?? ""),
        release: String(this.hostSystemProfile.release ?? ""),
        arch: String(this.hostSystemProfile.arch ?? ""),
        hostname: String(this.hostSystemProfile.hostname ?? ""),
        nodeVersion: String(this.hostSystemProfile.nodeVersion ?? ""),
        workspaceRoot:
          typeof this.hostSystemProfile.workspaceRoot === "string"
            ? this.hostSystemProfile.workspaceRoot
            : undefined
      },
      profile: resolution.profile,
      source: resolution.source,
      configuredToolNames,
      callableToolNames,
      webStatus: this.webTool.getStatus(),
      workspaceOnly: this.config.tools?.fs.workspaceOnly ?? true,
      allowedWritePaths: this.config.tools?.fs.allowedWritePaths ?? [],
      providerCapabilities: provider?.capabilities() ?? {
        supportsStreaming: false,
        supportsTools: false,
        supportsOAuth: false,
        supportsApiKeys: false,
        supportsImageInputs: false
      },
      channelCapabilities: activeChannel?.capabilities() ?? {
        supportsEdits: false,
        supportsDeletes: false,
        supportsReadReceipts: false,
        supportsFormattedText: false,
        supportsImageAttachments: false,
        supportsDocumentAttachments: false
      },
      scheduler: {
        enabled: schedulerStatus.enabled,
        running: schedulerStatus.running,
        blockedReason: schedulerStatus.blockedReason,
        taskCount: schedulerStatus.taskCount
      },
      growth: {
        installedSkillCount: liveSkills.length,
        managedHelperCount: managedHelpers.length,
        skillsDirectory: this.config.paths.skillsDir,
        helperToolsDirectory: this.managedHelperToolsDir()
      },
      installContext: this.installContext
    });
  }

  private awarenessFromSystemProfile(systemProfile: Record<string, unknown>): RuntimeAwarenessSnapshot | null {
    const awareness = systemProfile.awareness;
    if (!awareness || typeof awareness !== "object" || Array.isArray(awareness)) {
      return null;
    }
    return awareness as RuntimeAwarenessSnapshot;
  }

  private summarizeStoredSystemProfile(systemProfile: Record<string, unknown>): string {
    const awareness = this.awarenessFromSystemProfile(systemProfile);
    if (awareness) {
      return [
        `host=${awareness.host.platform}/${awareness.host.arch}`,
        `provider=${awareness.runtime.defaultProviderId}`,
        summarizeRuntimeAwareness(awareness)
      ].join(", ");
    }
    return JSON.stringify(systemProfile);
  }

  private ensureSessionBootstrap(
    sessionId: string,
    conversationKey: string,
    resolution: PolicyResolution
  ): {
    sessionId: string;
    assistantName: string;
    persona: string;
    operatorPreferences: string;
    coreIdentity: string;
    systemProfile: Record<string, unknown>;
    firstContactPrompted: boolean;
  } {
    const assistant = this.getGlobalAssistantProfile();
    const existing = this.db.getSessionBootstrap(sessionId);
    const awareness = this.buildAwarenessSnapshot(sessionId, conversationKey, resolution);
    const initializedAt = existing?.createdAt ?? new Date().toISOString();
    const systemProfile = {
      ...this.hostSystemProfile,
      conversationKey,
      initializedAt,
      awareness
    };
    if (existing) {
      if (
        existing.assistantName !== assistant.name ||
        existing.persona !== assistant.persona ||
        existing.operatorPreferences !== assistant.operatorPreferences ||
        JSON.stringify(existing.systemProfile) !== JSON.stringify(systemProfile)
      ) {
        return this.db.upsertSessionBootstrap({
          sessionId,
          assistantName: assistant.name,
          persona: assistant.persona,
          operatorPreferences: assistant.operatorPreferences,
          coreIdentity: existing.coreIdentity,
          systemProfile,
          firstContactPrompted: existing.firstContactPrompted
        });
      }
      return existing;
    }

    const created = this.db.upsertSessionBootstrap({
      sessionId,
      assistantName: assistant.name,
      persona: assistant.persona,
      operatorPreferences: assistant.operatorPreferences,
      coreIdentity: SESSION_BOOTSTRAP_CORE_IDENTITY,
      systemProfile,
      firstContactPrompted: false
    });
    return created;
  }

  private buildSessionBootstrapSystemMessage(bootstrap: {
    coreIdentity: string;
    systemProfile: Record<string, unknown>;
  }): NormalizedMessage {
    const assistant = this.getGlobalAssistantProfile();
    const awareness = this.awarenessFromSystemProfile(bootstrap.systemProfile);
    return {
      role: "system",
      content: [
        `Assistant identity: ${assistant.name}`,
        `Core identity: ${bootstrap.coreIdentity}`,
        `Persona guidance: ${assistant.persona}`,
        `Operator preferences: ${assistant.operatorPreferences || "(none configured)"}`,
        awareness
          ? buildRuntimeAwarenessSystemMessage(awareness)
          : `Runtime system profile: ${this.summarizeStoredSystemProfile(bootstrap.systemProfile)}`
      ].join("\n")
    };
  }

  private shouldSendFirstContactPrompt(
    text: string | undefined,
    bootstrap: { firstContactPrompted: boolean }
  ): boolean {
    if (!this.assistantConfig().promptOnFirstContact || bootstrap.firstContactPrompted) {
      return false;
    }
    const normalized = (text ?? "").trim().toLowerCase();
    return normalized === "/new" || normalized === "new";
  }

  private buildFirstContactPrompt(bootstrap: {
    assistantName: string;
    persona: string;
    operatorPreferences: string;
  }): string {
    return [
      "OpenAssist main-agent identity reminder for this chat:",
      "This is the global profile for the main OpenAssist agent.",
      `- name: ${bootstrap.assistantName}`,
      `- persona: ${bootstrap.persona}`,
      `- preferences: ${bootstrap.operatorPreferences || "(none yet)"}`,
      `- first-chat reminder: ${this.assistantConfig().promptOnFirstContact ? "enabled" : "disabled by current config"}`,
      "Global profile lock-in is enabled by default (first-boot guard).",
      "Use /help for the general welcome and /capabilities for the live capability inventory.",
      "To update intentionally, use force:",
      "/profile force=true; name=<name>; persona=<style>; prefs=<preferences>"
    ].join("\n");
  }

  private buildProfileStatusMessage(bootstrap: {
    assistantName: string;
    persona: string;
    operatorPreferences: string;
    systemProfile: Record<string, unknown>;
  }): string {
    const lock = this.getGlobalAssistantProfileLock();
    const awareness = this.awarenessFromSystemProfile(bootstrap.systemProfile);
    return [
      "OpenAssist global main-agent identity",
      `- name: ${bootstrap.assistantName}`,
      `- persona: ${bootstrap.persona}`,
      `- preferences: ${bootstrap.operatorPreferences || "(none yet)"}`,
      `- first-chat reminder: ${this.assistantConfig().promptOnFirstContact ? "enabled" : "disabled"}`,
      `- lock: ${lock.locked ? "enabled (first-boot lock-in; force required for updates)" : "disabled"}`,
      `- system: ${this.summarizeStoredSystemProfile(bootstrap.systemProfile)}`,
      ...(awareness ? [`- awareness: ${summarizeRuntimeAwareness(awareness)}`] : []),
      "Update command: /profile force=true; name=<name>; persona=<style>; prefs=<preferences>"
    ].join("\n");
  }

  private async handleProfileCommand(
    channel: ChannelAdapter,
    envelope: InboundEnvelope,
    sessionId: string
  ): Promise<void> {
    const resolution = await this.policyEngine.resolveProfile({
      sessionId,
      actorId: envelope.senderId
    });
    const bootstrap = this.ensureSessionBootstrap(
      sessionId,
      envelope.conversationKey,
      resolution
    );
    const global = this.getGlobalAssistantProfile();
    const profileCommand = parseProfileCommand(envelope.text ?? "");
    const updates = profileCommand;
    const lock = this.getGlobalAssistantProfileLock();
    const hasUpdates =
      typeof updates.name === "string" ||
      typeof updates.persona === "string" ||
      typeof updates.operatorPreferences === "string";

    let next = {
      assistantName: global.name,
      persona: global.persona,
      operatorPreferences: global.operatorPreferences,
      systemProfile: bootstrap.systemProfile
    };
    let blockedByLock = false;
    if (hasUpdates && lock.locked && !profileCommand.force) {
      blockedByLock = true;
    } else if (hasUpdates) {
      next = {
        assistantName: updates.name ?? global.name,
        persona: updates.persona ?? global.persona,
        operatorPreferences: updates.operatorPreferences ?? global.operatorPreferences,
        systemProfile: bootstrap.systemProfile
      };
      this.setGlobalAssistantProfile({
        name: next.assistantName,
        persona: next.persona,
        operatorPreferences: next.operatorPreferences
      });
      if (profileCommand.force) {
        this.setGlobalAssistantProfileLock({
          ...lock,
          lastForcedUpdateAt: new Date().toISOString()
        });
      }
      this.db.upsertSessionBootstrap({
        sessionId,
        assistantName: next.assistantName,
        persona: next.persona,
        operatorPreferences: next.operatorPreferences,
        coreIdentity: bootstrap.coreIdentity,
        systemProfile: bootstrap.systemProfile,
        firstContactPrompted: bootstrap.firstContactPrompted
      });
    }

    const profileMessage = (() => {
      if (blockedByLock) {
        return [
          "Global profile update blocked by first-boot lock-in guard.",
          "This prevents accidental changes to the main assistant identity.",
          "To update intentionally, rerun with force:",
          "/profile force=true; name=<name>; persona=<style>; prefs=<preferences>",
          "",
          this.buildProfileStatusMessage(next)
        ].join("\n");
      }
      if (hasUpdates) {
        return `Profile updated.\n${this.buildProfileStatusMessage(next)}`;
      }
      return this.buildProfileStatusMessage(next);
    })();
    const text = sanitizeUserOutput(profileMessage);
    this.db.recordAssistantMessage(sessionId, envelope.conversationKey, {
      role: "assistant",
      content: text
    }, {
      providerId: "runtime.profile",
      source: "runtime.profile"
    });

    await this.sendOutboundWithRetry(channel, sessionId, {
      channel: envelope.channel,
      conversationKey: envelope.conversationKey,
      text,
      replyToTransportMessageId: envelope.transportMessageId,
      metadata: {
        source: "runtime-profile"
      }
    });
  }

  private async buildAccessStatusMessage(sessionId: string, senderId: string): Promise<string> {
    const resolution = await this.policyEngine.resolveProfile({
      sessionId,
      actorId: senderId
    });
    const canManage = this.policyEngine.isApprovedOperator(sessionId, senderId);
    const operatorsConfigured = this.policyEngine.hasApprovedOperators(sessionId);
    return [
      "OpenAssist access for this chat",
      `- sender id: ${senderId}`,
      `- session id: ${sessionId}`,
      `- current access: ${describeAccessMode(resolution.profile)}`,
      `- access source: ${describeAccessSource(resolution.source)}`,
      `- access changes in chat: ${
        canManage
          ? "available for this sender"
          : operatorsConfigured
            ? "not allowed for this sender"
            : "disabled until approved operator IDs are configured"
      }`,
      canManage
        ? "- commands: /access full for full access, /access standard for standard access"
        : "- note: only explicitly approved operator IDs may change access in chat",
      "- full access uses OpenAssist full-root tools and open filesystem scope. It does not grant Unix root."
    ].join("\n");
  }

  private async handleAccessCommand(
    channel: ChannelAdapter,
    envelope: InboundEnvelope,
    sessionId: string
  ): Promise<void> {
    const parsed = parseAccessCommand(envelope.text ?? "");
    const senderId = envelope.senderId;
    const canManage = this.policyEngine.isApprovedOperator(sessionId, senderId);
    const operatorsConfigured = this.policyEngine.hasApprovedOperators(sessionId);

    let message: string;
    if (parsed.error) {
      message = parsed.error;
    } else if (!parsed.desiredProfile) {
      message = await this.buildAccessStatusMessage(sessionId, senderId);
    } else if (!canManage) {
      message = [
        operatorsConfigured
          ? "Access change blocked. This sender is not on the approved operator list for this channel."
          : "Access change blocked. This channel has no approved operator IDs configured yet.",
        "",
        await this.buildAccessStatusMessage(sessionId, senderId)
      ].join("\n");
    } else {
      await this.policyEngine.setProfile(sessionId, parsed.desiredProfile, senderId);
      message = [
        `Access updated for this sender in this chat: ${describeAccessMode(parsed.desiredProfile)}`,
        "",
        await this.buildAccessStatusMessage(sessionId, senderId)
      ].join("\n");
    }

    const text = sanitizeUserOutput(message);
    this.db.recordAssistantMessage(
      sessionId,
      envelope.conversationKey,
      {
        role: "assistant",
        content: text
      },
      {
        providerId: "runtime.access",
        source: "runtime.access"
      }
    );

    await this.sendOutboundWithRetry(channel, sessionId, {
      channel: envelope.channel,
      conversationKey: envelope.conversationKey,
      text,
      replyToTransportMessageId: envelope.transportMessageId,
      metadata: {
        source: "runtime-access"
      }
    });
  }

  private async buildOperationalStatusMessage(sessionId: string, senderId: string): Promise<string> {
    const runtimeStatus = this.getStatus();
    const time = this.getTimeStatus();
    const scheduler = this.getSchedulerStatus();
    const channels = await this.getChannelStatuses().catch((error) => {
      this.logger.warn({ error }, "failed to collect channel statuses for status command");
      return [];
    });
    const toolsStatus = await this.getToolsStatus(sessionId, senderId);

    const moduleSummary =
      Object.entries(runtimeStatus.modules)
        .map(([moduleId, status]) => `${moduleId}=${status}`)
        .join(", ") || "none";
    const channelSummary =
      channels
        .map((channel) => `${channel.channelId}:${channel.health}`)
        .join(", ") || "none";

    const schedulerState = scheduler.enabled
      ? scheduler.running
        ? "running"
        : `not running${scheduler.blockedReason ? ` (${scheduler.blockedReason})` : ""}`
      : "disabled";
    const assistant = this.assistantConfig();
    const { awareness } = await this.ensureSessionAwareness(sessionId, senderId);
    const growthStatus = await this.getGrowthStatus(sessionId, senderId);
    const canManageAccess = this.policyEngine.isApprovedOperator(sessionId, senderId);
    const operatorsConfigured = this.policyEngine.hasApprovedOperators(sessionId);
    const docRefs = awareness.documentation.refs.map((ref) => ref.path).join(", ") || "none";
    const installSummary = awareness.maintenance.repoBackedInstall
      ? `repo-backed install at ${awareness.maintenance.installDir ?? "(not known)"}`
      : "install metadata not recorded as a repo-backed install";
    const publicInstallSummary = awareness.maintenance.repoBackedInstall
      ? "repo-backed install metadata recorded"
      : "install metadata not recorded as a repo-backed install";
    const maintenanceSummary = awareness.capabilities.canEditConfig ||
      awareness.capabilities.canEditDocs ||
      awareness.capabilities.canEditCode
      ? "bounded local self-maintenance is available in this session"
      : "self-maintenance is advisory-only in this session";
    const lifecycleStatusLines = canManageAccess
      ? [
          `- config path: ${awareness.maintenance.configPath ?? "(not known)"}`,
          `- env file path: ${awareness.maintenance.envFilePath ?? "(not known)"}`,
          `- install/update: ${installSummary}; trackedRef=${awareness.maintenance.trackedRef ?? "(not known)"}; lastKnownGood=${awareness.maintenance.lastKnownGoodCommit ?? "(not known)"}`,
          `- protected paths: ${awareness.maintenance.protectedPaths.join(", ") || "none"}`,
          `- protected surfaces: ${awareness.maintenance.protectedSurfaces.join(", ") || "none"}`
        ]
      : [
          `- install/update: ${publicInstallSummary}`,
          "- config/env/install detail: hidden in chat for this sender; approved operators can see full lifecycle paths here, and 'openassist doctor' shows them on the host.",
          "- protected lifecycle detail: hidden in chat for this sender."
        ];

    return [
      "OpenAssist local status",
      `- sender id: ${senderId}`,
      `- session id: ${sessionId}`,
      `- default provider: ${this.config.defaultProviderId}`,
      `- assistant: ${assistant.name}`,
      `- what this is: ${OPENASSIST_SOFTWARE_IDENTITY}`,
      `- chat surface: ${this.formatChannelSurfaceSummary(sessionId)}`,
      `- current access: ${describeAccessMode(toolsStatus.profile)}`,
      `- access source: ${describeAccessSource(toolsStatus.profileSource)}`,
      `- awareness: ${summarizeRuntimeAwareness(awareness)}`,
      `- host: platform=${awareness.host.platform}, release=${awareness.host.release}, arch=${awareness.host.arch}, hostname=${awareness.host.hostname}, node=${awareness.host.nodeVersion}`,
      `- callable tools now: ${toolsStatus.enabledTools.join(", ") || "none"}`,
      `- configured tool families: ${toolsStatus.configuredTools.join(", ") || "none"}`,
      `- can inspect local files: ${awareness.capabilities.canInspectLocalFiles ? "yes" : "no"}`,
      `- can run local commands: ${awareness.capabilities.canRunLocalCommands ? "yes" : "no"}`,
      `- can edit local config/docs/code: config=${awareness.capabilities.canEditConfig ? "yes" : "no"}, docs=${awareness.capabilities.canEditDocs ? "yes" : "no"}, code=${awareness.capabilities.canEditCode ? "yes" : "no"}`,
      `- service control in this session: ${awareness.capabilities.canControlService ? "available" : "blocked"}`,
      `- native web: ${toolsStatus.webTool.searchStatus} (mode=${toolsStatus.webTool.searchMode}, braveConfigured=${toolsStatus.webTool.braveApiConfigured})`,
      `- local docs/config map: ${docRefs}`,
      `- self-maintenance mode: ${maintenanceSummary}`,
      `- managed growth: mode=${growthStatus.defaultMode}, skills=${growthStatus.installedSkills.length}, helpers=${growthStatus.managedHelpers.length}, actionsNow=${growthStatus.fullRootCanGrowNow ? "yes" : "no"}`,
      ...(canManageAccess
        ? [`- growth directories: skills=${growthStatus.skillsDirectory}, helpers=${growthStatus.helperToolsDirectory}`]
        : ["- growth directories: hidden in chat for this sender; use 'openassist growth status' on the host for full paths."]),
      `- growth update-safety: ${growthStatus.updateSafetyNote}`,
      ...lifecycleStatusLines,
      `- modules: ${moduleSummary}`,
      `- channels: ${channelSummary}`,
      `- time: ${time.clockHealth}, timezone=${time.timezone}, confirmed=${time.timezoneConfirmed}`,
      `- scheduler: ${schedulerState}`,
      `- blocked reasons: ${awareness.capabilities.blockedReasons.join(" | ") || "none"}`,
      `- access changes in chat: ${
        canManageAccess
          ? "available for this sender (/access full or /access standard)"
          : operatorsConfigured
            ? "not allowed for this sender"
            : "disabled until approved operator IDs are configured"
      }`,
      `- prefer lifecycle commands: ${awareness.maintenance.preferredCommands.join(", ")}`,
      "- global profile memory: use '/profile' to view or '/profile force=true; name=...; persona=...; prefs=...' to update"
    ].join("\n");
  }

  private async resolveToolSchemasForSession(sessionId: string, actorId: string): Promise<ToolSchema[]> {
    const resolution = await this.policyEngine.resolveProfile({ sessionId, actorId });
    if (resolution.profile !== "full-root") {
      return [];
    }
    return this.enabledToolSchemas();
  }

  private enabledToolSchemas(): ToolSchema[] {
    return runtimeToolSchemas({
      enablePackageTool: this.config.tools?.pkg.enabled ?? true,
      enableWebTools: this.config.tools?.web?.enabled ?? DEFAULT_WEB_TOOLS.enabled
    });
  }

  private reconcileToolConversationForProvider(
    messages: NormalizedMessage[],
    sessionId: string,
    conversationKey: string
  ): NormalizedMessage[] {
    const reconciled: NormalizedMessage[] = [];
    const pendingToolCalls = new Map<string, number[]>();
    let droppedOrphanToolResults = 0;

    for (const message of messages) {
      if (message.role === "assistant" && message.toolCallId && message.toolName) {
        const index = reconciled.length;
        reconciled.push(message);
        const pending = pendingToolCalls.get(message.toolCallId) ?? [];
        pending.push(index);
        pendingToolCalls.set(message.toolCallId, pending);
        continue;
      }

      if (message.role === "tool") {
        const callId = message.toolCallId;
        if (!callId) {
          droppedOrphanToolResults += 1;
          continue;
        }
        const pending = pendingToolCalls.get(callId);
        if (!pending || pending.length === 0) {
          droppedOrphanToolResults += 1;
          continue;
        }
        pending.shift();
        reconciled.push(message);
        continue;
      }

      reconciled.push(message);
    }

    const unresolvedAssistantToolCallIndexes = new Set<number>();
    for (const indexes of pendingToolCalls.values()) {
      for (const index of indexes) {
        unresolvedAssistantToolCallIndexes.add(index);
      }
    }

    if (unresolvedAssistantToolCallIndexes.size === 0 && droppedOrphanToolResults === 0) {
      return reconciled;
    }

    const filtered = reconciled.filter(
      (_message, index) => !unresolvedAssistantToolCallIndexes.has(index)
    );
    this.logger.warn(
      {
        type: "tool.call.context.reconciled",
        sessionId,
        conversationKey,
        droppedOrphanAssistantToolCalls: unresolvedAssistantToolCallIndexes.size,
        droppedOrphanToolResults
      },
      "reconciled tool-call context before provider request"
    );
    return filtered;
  }

  private async executeToolCallWithAudit(
    sessionId: string,
    conversationKey: string,
    actorId: string,
    toolCall: ToolCall
  ): Promise<ToolExecutionRecord> {
    const request = (() => {
      try {
        return JSON.parse(toolCall.argumentsJson || "{}") as Record<string, unknown>;
      } catch {
        return {} as Record<string, unknown>;
      }
    })();
    const auditRequest = redactSensitiveData(request) as Record<string, unknown>;

    const invocationId = this.db.startToolInvocation({
      sessionId,
      conversationKey,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      actorId,
      request: auditRequest
    });
    this.logger.info(
      {
        type: "tool.call.start",
        sessionId,
        conversationKey,
        actorId,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        invocationId
      },
      "tool invocation started"
    );

    const startedAt = Date.now();
    const execution = await this.toolRouter.execute(toolCall, { sessionId, actorId });
    const durationMs = Date.now() - startedAt;
    const auditResult = redactSensitiveData(execution.result) as Record<string, unknown>;

    if (execution.status === "succeeded") {
      this.db.finishToolInvocationSuccess(invocationId, auditResult, durationMs);
    } else if (execution.status === "blocked") {
      this.db.finishToolInvocationFailure(
        invocationId,
        execution.errorText ?? "blocked by guardrail",
        durationMs,
        auditResult,
        "blocked"
      );
    } else {
      this.db.finishToolInvocationFailure(
        invocationId,
        execution.errorText ?? "tool invocation failed",
        durationMs,
        auditResult,
        "failed"
      );
    }

    this.logger.info(
      {
        type: execution.status === "blocked" ? "tool.call.blocked" : "tool.call.finish",
        sessionId,
        conversationKey,
        actorId,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        invocationId,
        status: execution.status,
        durationMs
      },
      "tool invocation completed"
    );
    return execution;
  }

  private resolveOauthCodeVerifier(rawCodeVerifier: string): string {
    if (rawCodeVerifier.startsWith("enc:")) {
      return this.secretBox.decrypt(rawCodeVerifier.slice("enc:".length));
    }
    return rawCodeVerifier;
  }

  private async executeScheduledTaskJob(payload: Record<string, unknown>): Promise<void> {
    const taskId = String(payload.taskId ?? "");
    const scheduledFor = String(payload.scheduledFor ?? "");
    if (!taskId || !scheduledFor) {
      throw new Error("scheduled_task_execute payload missing taskId or scheduledFor");
    }

    const task = this.config.scheduler.tasks.find((candidate) => candidate.id === taskId);
    if (!task || !task.enabled) {
      throw new Error(`Scheduled task ${taskId} not found or disabled`);
    }

    const runId = this.db.createScheduledRun(taskId, scheduledFor);
    this.logger.info(
      {
        type: "scheduler.run.start",
        taskId,
        runId,
        scheduledFor
      },
      "scheduled task run started"
    );

    try {
      const result = await this.executeScheduledTask(task, scheduledFor);

      let transportMessageId: string | undefined;
      if (task.output?.channelId && task.output?.conversationKey) {
        const channel = this.channels.get(task.output.channelId);
        if (!channel) {
          throw new Error(`Configured output channel ${task.output.channelId} is not available`);
        }

        const rendered = renderScheduledOutput(
          task.output.messageTemplate,
          result.text,
          task.id,
          scheduledFor
        );
        const sent = await channel.send({
          channel: this.channelTypes.get(task.output.channelId) ?? "scheduler",
          conversationKey: task.output.conversationKey,
          text: rendered,
          metadata: {
            source: "scheduler",
            taskId: task.id
          }
        });
        transportMessageId = sent.transportMessageId;
      }

      this.db.completeScheduledRunSuccess(
        runId,
        {
          taskId,
          scheduledFor,
          text: result.text,
          details: result.details
        },
        transportMessageId
      );

      this.logger.info(
        {
          type: "scheduler.run.finish",
          taskId,
          runId,
          status: "succeeded"
        },
        "scheduled task run succeeded"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db.completeScheduledRunFailure(runId, message);
      this.logger.error(
        {
          type: "scheduler.run.finish",
          taskId,
          runId,
          status: "failed",
          error: message
        },
        "scheduled task run failed"
      );
      throw error;
    }
  }

  private async executeScheduledTask(
    task: ScheduledTaskConfig,
    scheduledFor: string
  ): Promise<{ text: string; details: Record<string, unknown> }> {
    if (task.action.type === "skill") {
      const output = await this.skillRuntime.executeScript(
        task.action.skillId,
        task.action.entrypoint,
        {
          ...(task.action.input ?? {}),
          _scheduler: {
            taskId: task.id,
            scheduledFor
          }
        }
      );

      const text = toDisplayText(output);
      return {
        text,
        details: {
          actionType: "skill",
          skillId: task.action.skillId,
          entrypoint: task.action.entrypoint,
          output
        }
      };
    }

    const providerId = task.action.providerId ?? this.config.defaultProviderId;
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found for scheduled prompt task`);
    }

    const providerModel =
      task.action.model ??
      this.config.providers.find((item) => item.id === provider.id())?.defaultModel ??
      "unknown";

    const response = await this.chatWithProvider(
      provider,
      {
        sessionId: `scheduler:${task.id}`,
        model: providerModel,
        messages: [
          {
            role: "system",
            content: defaultSystemPrompt()
          },
          {
            role: "user",
            content: task.action.promptTemplate
          }
        ],
        tools: [],
        metadata: {
          source: "scheduler",
          taskId: task.id,
          scheduledFor,
          ...(task.action.metadata ?? {})
        }
      }
    );

    const safeText = sanitizeUserOutput(response.output.content);
    return {
      text: safeText,
      details: {
        actionType: "prompt",
        providerId: provider.id(),
        model: providerModel,
        usage: response.usage,
        finishReason: response.finishReason
      }
    };
  }

  getTools(): { execTool: ExecTool; fsTool: FsTool; pkgTool: PackageInstallTool; webTool: WebTool } {
    return {
      execTool: this.execTool,
      fsTool: this.fsTool,
      pkgTool: this.pkgTool,
      webTool: this.webTool
    };
  }

  getSkillRuntime(): FileSkillRuntime {
    return this.skillRuntime;
  }

  async getChannelStatuses(): Promise<
    Array<{
      channelId: string;
      channelType: RuntimeConfig["channels"][number]["type"] | "unknown";
      health: Awaited<ReturnType<ChannelAdapter["health"]>>;
    }>
  > {
    const result: Array<{
      channelId: string;
      channelType: RuntimeConfig["channels"][number]["type"] | "unknown";
      health: Awaited<ReturnType<ChannelAdapter["health"]>>;
    }> = [];
    for (const [channelId, adapter] of this.channels.entries()) {
      result.push({
        channelId,
        channelType: this.channelTypes.get(channelId) ?? "unknown",
        health: await adapter.health()
      });
    }
    return result;
  }
}
