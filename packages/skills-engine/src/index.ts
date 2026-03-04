import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { SkillManifest, SkillRuntime } from "@openassist/core-types";

const skillManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.string().min(1),
  description: z.string().min(1),
  triggers: z.array(z.string()).default([]),
  requiredCapabilities: z.array(z.enum([
    "tool.exec",
    "tool.fs.read",
    "tool.fs.write",
    "network.outbound",
    "provider.oauth",
    "provider.api",
    "channel.send",
    "channel.receive"
  ])).default([]),
  resources: z.object({
    promptFiles: z.array(z.string()).default([]),
    referenceFiles: z.array(z.string()).default([]),
    scriptEntrypoints: z.array(z.string()).default([])
  })
});

export interface FileSkillRuntimeOptions {
  skillsRoot: string;
}

export class FileSkillRuntime implements SkillRuntime {
  private readonly skillsRoot: string;

  constructor(options: FileSkillRuntimeOptions) {
    this.skillsRoot = path.resolve(options.skillsRoot);
    fs.mkdirSync(this.skillsRoot, { recursive: true });
  }

  async listInstalled(): Promise<SkillManifest[]> {
    const entries = fs.readdirSync(this.skillsRoot, { withFileTypes: true });
    const manifests: SkillManifest[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const manifestPath = path.join(this.skillsRoot, entry.name, "openassist.skill.json");
      if (!fs.existsSync(manifestPath)) {
        continue;
      }

      const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifests.push(skillManifestSchema.parse(parsed));
    }

    return manifests.sort((a, b) => a.id.localeCompare(b.id));
  }

  async installFromPath(sourcePath: string): Promise<void> {
    const absoluteSourcePath = path.resolve(sourcePath);
    const manifestPath = path.join(absoluteSourcePath, "openassist.skill.json");

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Skill manifest missing: ${manifestPath}`);
    }

    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const manifest = skillManifestSchema.parse(parsed);

    const targetPath = path.join(this.skillsRoot, manifest.id);
    fs.rmSync(targetPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.cpSync(absoluteSourcePath, targetPath, { recursive: true });
  }

  async resolveForIntent(intent: string): Promise<SkillManifest[]> {
    const lowered = intent.toLowerCase();
    const all = await this.listInstalled();
    return all.filter((skill) =>
      skill.triggers.some((trigger) => lowered.includes(trigger.toLowerCase()))
    );
  }

  async executeScript(skillId: string, entrypoint: string, input: unknown): Promise<unknown> {
    const skillPath = path.join(this.skillsRoot, skillId);
    const scriptPath = path.resolve(skillPath, entrypoint);

    if (!scriptPath.startsWith(skillPath)) {
      throw new Error("Invalid entrypoint path traversal attempt");
    }

    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Skill script not found: ${scriptPath}`);
    }

    const moduleUrl = pathToFileURL(scriptPath).href;
    const imported = await import(moduleUrl);
    if (typeof imported.run !== "function") {
      throw new Error(`Skill script ${entrypoint} does not export async run(input)`);
    }

    return imported.run(input);
  }
}

export function validateSkillManifest(input: unknown): SkillManifest {
  return skillManifestSchema.parse(input);
}