export type PolicyProfile = "restricted" | "operator" | "full-root";
export type EffectivePolicySource =
  | "default"
  | "channel-operator-default"
  | "session-override"
  | "actor-override";

export type ToolAction =
  | "exec.run"
  | "fs.read"
  | "fs.write"
  | "fs.delete"
  | "pkg.install"
  | "web.search"
  | "web.fetch"
  | "web.run"
  | "provider.oauth.start"
  | "provider.oauth.complete";

export interface AuthorizationContext {
  sessionId: string;
  actorId: string;
  path?: string;
  command?: string;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
}

export interface PolicyResolution {
  profile: PolicyProfile;
  source: EffectivePolicySource;
}

export interface PolicyEngine {
  resolveProfile(input: { sessionId: string; actorId?: string }): Promise<PolicyResolution>;
  currentProfile(sessionId: string, actorId?: string): Promise<PolicyProfile>;
  setProfile(sessionId: string, profile: PolicyProfile, actorId?: string): Promise<void>;
  authorize(action: ToolAction, context: AuthorizationContext): Promise<AuthorizationDecision>;
}
