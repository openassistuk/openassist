import type {
  AuthorizationContext,
  AuthorizationDecision,
  ChannelConfig,
  PolicyEngine,
  PolicyProfile,
  PolicyResolution,
  ToolAction
} from "@openassist/core-types";
import type { OpenAssistDatabase } from "@openassist/storage-sqlite";

const FULL_ROOT_ALLOWED_ACTIONS: ToolAction[] = [
  "channel.send",
  "exec.run",
  "fs.read",
  "fs.write",
  "fs.delete",
  "pkg.install",
  "web.search",
  "web.fetch",
  "web.run",
  "provider.oauth.start",
  "provider.oauth.complete"
];

const OPERATOR_ALLOWED_ACTIONS: ToolAction[] = [
  "exec.run",
  "fs.read",
  "fs.write",
  "provider.oauth.start",
  "provider.oauth.complete"
];

const RESTRICTED_ALLOWED_ACTIONS: ToolAction[] = ["provider.oauth.start", "provider.oauth.complete"];

export interface DatabasePolicyEngineOptions {
  db: OpenAssistDatabase;
  defaultProfile: PolicyProfile;
  operatorAccessProfile: Extract<PolicyProfile, "operator" | "full-root">;
  channels: ChannelConfig[];
}

interface ParsedSessionReference {
  exactSessionId: string;
  channelId?: string;
  channelType?: ChannelConfig["type"];
  conversationKey: string;
  legacySessionId?: string;
}

function splitSessionId(sessionId: string): { prefix: string; conversationKey: string } | null {
  const separatorIndex = sessionId.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }

  return {
    prefix: sessionId.slice(0, separatorIndex),
    conversationKey: sessionId.slice(separatorIndex + 1)
  };
}

export class DatabasePolicyEngine implements PolicyEngine {
  private readonly db: OpenAssistDatabase;
  private defaultProfile: PolicyProfile;
  private operatorAccessProfile: Extract<PolicyProfile, "operator" | "full-root">;
  private channelsById = new Map<string, ChannelConfig>();
  private channelsByType = new Map<ChannelConfig["type"], ChannelConfig[]>();

  constructor(options: DatabasePolicyEngineOptions) {
    this.db = options.db;
    this.defaultProfile = options.defaultProfile;
    this.operatorAccessProfile = options.operatorAccessProfile;
    this.setChannels(options.channels);
  }

  updateConfig(options: {
    defaultProfile: PolicyProfile;
    operatorAccessProfile: Extract<PolicyProfile, "operator" | "full-root">;
    channels: ChannelConfig[];
  }): void {
    this.defaultProfile = options.defaultProfile;
    this.operatorAccessProfile = options.operatorAccessProfile;
    this.setChannels(options.channels);
  }

  private setChannels(channels: ChannelConfig[]): void {
    this.channelsById = new Map(channels.map((channel) => [channel.id, channel]));
    this.channelsByType = new Map();
    for (const channel of channels) {
      const bucket = this.channelsByType.get(channel.type) ?? [];
      bucket.push(channel);
      this.channelsByType.set(channel.type, bucket);
    }
  }

  private parseSessionReference(sessionId: string): ParsedSessionReference {
    const split = splitSessionId(sessionId);
    if (!split) {
      return {
        exactSessionId: sessionId,
        conversationKey: "__unknown__"
      };
    }

    const byChannelId = this.channelsById.get(split.prefix);
    if (byChannelId) {
      const peers = this.channelsByType.get(byChannelId.type) ?? [];
      return {
        exactSessionId: sessionId,
        channelId: byChannelId.id,
        channelType: byChannelId.type,
        conversationKey: split.conversationKey,
        legacySessionId:
          peers.length === 1 ? `${byChannelId.type}:${split.conversationKey}` : undefined
      };
    }

    if (split.prefix === "telegram" || split.prefix === "discord" || split.prefix === "whatsapp-md") {
      const peers = this.channelsByType.get(split.prefix) ?? [];
      if (peers.length === 1) {
        return {
          exactSessionId: sessionId,
          channelId: peers[0].id,
          channelType: split.prefix,
          conversationKey: split.conversationKey,
          legacySessionId: sessionId
        };
      }
    }

    return {
      exactSessionId: sessionId,
      conversationKey: split.conversationKey
    };
  }

  private channelOperatorIds(channelId?: string): string[] {
    if (!channelId) {
      return [];
    }
    const channel = this.channelsById.get(channelId);
    const configured = channel?.settings.operatorUserIds;
    return Array.isArray(configured)
      ? configured.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  }

  isApprovedOperator(sessionId: string, actorId: string): boolean {
    const parsed = this.parseSessionReference(sessionId);
    return this.channelOperatorIds(parsed.channelId).includes(actorId);
  }

  hasApprovedOperators(sessionId: string): boolean {
    const parsed = this.parseSessionReference(sessionId);
    return this.channelOperatorIds(parsed.channelId).length > 0;
  }

  private lookupActorOverride(sessionId: string, actorId?: string): PolicyProfile | null {
    if (!actorId) {
      return null;
    }
    return this.db.getActorPolicyProfile(sessionId, actorId);
  }

  private lookupSessionOverride(sessionId: string): PolicyProfile | null {
    return this.db.getPolicyProfile(sessionId);
  }

  async resolveProfile(input: { sessionId: string; actorId?: string }): Promise<PolicyResolution> {
    const parsed = this.parseSessionReference(input.sessionId);
    const actorOverride =
      this.lookupActorOverride(parsed.exactSessionId, input.actorId) ??
      (parsed.legacySessionId && parsed.legacySessionId !== parsed.exactSessionId
        ? this.lookupActorOverride(parsed.legacySessionId, input.actorId)
        : null);
    if (actorOverride) {
      return {
        profile: actorOverride,
        source: "actor-override"
      };
    }

    const sessionOverride =
      this.lookupSessionOverride(parsed.exactSessionId) ??
      (parsed.legacySessionId && parsed.legacySessionId !== parsed.exactSessionId
        ? this.lookupSessionOverride(parsed.legacySessionId)
        : null);
    if (sessionOverride) {
      return {
        profile: sessionOverride,
        source: "session-override"
      };
    }

    if (
      input.actorId &&
      this.operatorAccessProfile === "full-root" &&
      this.channelOperatorIds(parsed.channelId).includes(input.actorId)
    ) {
      return {
        profile: "full-root",
        source: "channel-operator-default"
      };
    }

    return {
      profile: this.defaultProfile,
      source: "default"
    };
  }

  async currentProfile(sessionId: string, actorId?: string): Promise<PolicyProfile> {
    return (await this.resolveProfile({ sessionId, actorId })).profile;
  }

  async setProfile(sessionId: string, profile: PolicyProfile, actorId?: string): Promise<void> {
    if (actorId) {
      this.db.setActorPolicyProfile(sessionId, actorId, profile);
      return;
    }
    this.db.setPolicyProfile(sessionId, profile);
  }

  async authorize(action: ToolAction, context: AuthorizationContext): Promise<AuthorizationDecision> {
    const { profile } = await this.resolveProfile({
      sessionId: context.sessionId,
      actorId: context.actorId
    });
    const allowedActions =
      profile === "full-root"
        ? FULL_ROOT_ALLOWED_ACTIONS
        : profile === "operator"
          ? OPERATOR_ALLOWED_ACTIONS
          : RESTRICTED_ALLOWED_ACTIONS;

    if (!allowedActions.includes(action)) {
      return {
        allowed: false,
        reason: `Action ${action} blocked for profile ${profile}`
      };
    }

    return {
      allowed: true
    };
  }
}
