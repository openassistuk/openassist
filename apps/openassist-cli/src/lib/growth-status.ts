import fs from "node:fs";
import path from "node:path";
import type { OpenAssistConfig } from "@openassist/config";
import type { OpenAssistLogger } from "@openassist/observability";

export interface LocalGrowthSkillSummary {
  id: string;
  version: string;
  description: string;
}

export interface LocalGrowthState {
  skillsDirectory: string;
  helperToolsDirectory: string;
  installedSkills: LocalGrowthSkillSummary[];
  managedHelpers: Array<{
    id: string;
    installer: string;
    installRoot: string;
    summary: string;
    updateSafe: boolean;
  }>;
  updateSafetyNote: string;
}

function resolveRuntimePath(configPath: string, inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(path.dirname(configPath), inputPath);
}

function listInstalledSkills(skillsDirectory: string): LocalGrowthSkillSummary[] {
  if (!fs.existsSync(skillsDirectory)) {
    return [];
  }

  const entries = fs.readdirSync(skillsDirectory, { withFileTypes: true });
  const skills: LocalGrowthSkillSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(skillsDirectory, entry.name, "openassist.skill.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        id?: string;
        version?: string;
        description?: string;
      };
      if (!parsed.id || !parsed.version || !parsed.description) {
        continue;
      }
      skills.push({
        id: parsed.id,
        version: parsed.version,
        description: parsed.description
      });
    } catch {
      // Ignore malformed skill manifests in operator status output.
    }
  }

  return skills.sort((left, right) => left.id.localeCompare(right.id));
}

export async function inspectLocalGrowthState(
  configPath: string,
  config: OpenAssistConfig,
  logger: OpenAssistLogger
): Promise<LocalGrowthState> {
  const dataDir = resolveRuntimePath(configPath, config.runtime.paths.dataDir);
  const skillsDirectory = resolveRuntimePath(configPath, config.runtime.paths.skillsDir);
  const helperToolsDirectory = path.join(path.resolve(dataDir), "helper-tools");
  const dbPath = path.join(path.resolve(dataDir), "openassist.db");
  const installedSkills = listInstalledSkills(skillsDirectory);
  let managedHelpers: LocalGrowthState["managedHelpers"] = [];

  if (fs.existsSync(dbPath)) {
    const { OpenAssistDatabase } = await import("@openassist/storage-sqlite");
    const db = new OpenAssistDatabase({ dbPath, logger });
    try {
      managedHelpers = db.listManagedCapabilities("helper-tool");
    } finally {
      db.close();
    }
  }

  return {
    skillsDirectory,
    helperToolsDirectory,
    installedSkills,
    managedHelpers,
    updateSafetyNote:
      "Managed skills and helper tools live under runtime-owned paths and survive normal updates more predictably than direct repo changes."
  };
}
