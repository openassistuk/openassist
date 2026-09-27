/** Installation metadata never contains credentials or conversation content. */
export interface BuildIdentity {
  id: string;
  version: string;
  commit: string;
  nodeVersion: string;
  configVersion: number;
  databaseVersion: number;
}

export interface ReleaseArtifact {
  platform: "linux" | "darwin";
  arch: "x64" | "arm64";
  file: string;
  sha256: string;
  bytes: number;
}

export interface ReleaseManifest {
  schemaVersion: 1;
  build: BuildIdentity;
  channel: "stable" | "preview";
  artifacts: ReleaseArtifact[];
}

export interface InstalledApplication {
  method: "release" | "source";
  path: string;
  nodePath: string;
  build: BuildIdentity;
  verified: boolean;
  channel?: "stable" | "preview";
  pinnedVersion?: string;
  ref?: string;
}

export interface OwnedInstallFile {
  path: string;
  sha256: string;
}

export interface LifecycleResult {
  ok: boolean;
  action: string;
  detail: string;
  nextCommand?: string;
}
