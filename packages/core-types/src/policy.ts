export type PolicyProfile = "restricted" | "operator" | "full-root";

export type ToolAction =
  | "exec.run"
  | "fs.read"
  | "fs.write"
  | "fs.delete"
  | "pkg.install"
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

export interface PolicyEngine {
  currentProfile(sessionId: string): Promise<PolicyProfile>;
  setProfile(sessionId: string, profile: PolicyProfile): Promise<void>;
  authorize(action: ToolAction, context: AuthorizationContext): Promise<AuthorizationDecision>;
}
