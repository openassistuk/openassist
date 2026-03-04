export type CapabilityName =
  | "tool.exec"
  | "tool.fs.read"
  | "tool.fs.write"
  | "network.outbound"
  | "provider.oauth"
  | "provider.api"
  | "channel.send"
  | "channel.receive";

export interface SkillManifest {
  id: string;
  version: string;
  description: string;
  triggers: string[];
  requiredCapabilities: CapabilityName[];
  resources: {
    promptFiles: string[];
    referenceFiles: string[];
    scriptEntrypoints: string[];
  };
}

export interface SkillRuntime {
  listInstalled(): Promise<SkillManifest[]>;
  installFromPath(path: string): Promise<void>;
  resolveForIntent(intent: string): Promise<SkillManifest[]>;
  executeScript(skillId: string, entrypoint: string, input: unknown): Promise<unknown>;
}