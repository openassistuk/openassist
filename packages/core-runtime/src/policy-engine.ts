import type {
  AuthorizationContext,
  AuthorizationDecision,
  PolicyEngine,
  PolicyProfile,
  ToolAction
} from "@openassist/core-types";
import type { OpenAssistDatabase } from "@openassist/storage-sqlite";

const FULL_ROOT_ALLOWED_ACTIONS: ToolAction[] = [
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
}

export class DatabasePolicyEngine implements PolicyEngine {
  private readonly db: OpenAssistDatabase;
  private readonly defaultProfile: PolicyProfile;

  constructor(options: DatabasePolicyEngineOptions) {
    this.db = options.db;
    this.defaultProfile = options.defaultProfile;
  }

  async currentProfile(sessionId: string): Promise<PolicyProfile> {
    return this.db.getPolicyProfile(sessionId) ?? this.defaultProfile;
  }

  async setProfile(sessionId: string, profile: PolicyProfile): Promise<void> {
    this.db.setPolicyProfile(sessionId, profile);
  }

  async authorize(action: ToolAction, context: AuthorizationContext): Promise<AuthorizationDecision> {
    const profile = await this.currentProfile(context.sessionId);
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
