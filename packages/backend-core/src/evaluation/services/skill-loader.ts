import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

import { load_skill_from_path, type Skill } from "@openhands-rl/runtime-core/runtime";

import { settings } from "../../config/settings";
import type { ResolvedContextPackage, SkillRecord } from "../schemas";
import { buildPackageSkillRecord, buildStrategySkillRecord } from "./skill-telemetry";

function resolveAssetPath(pathValue: string): string {
  return pathValue.startsWith("/")
    ? pathValue
    : resolve(settings.evaluationAssetsRoot, pathValue);
}

export function findEvaluationSkillPath(skillId: string): string | null {
  const roots = [
    resolve(settings.evaluationAssetsRoot, "skills"),
    resolve(settings.platformContextRoot, ".agents", "skills"),
  ];
  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of readdirSync(current)) {
        const fullPath = resolve(current, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          const skillFile = resolve(fullPath, "SKILL.md");
          if (entry === skillId && existsSync(skillFile)) {
            return skillFile;
          }
          stack.push(fullPath);
          continue;
        }
        if (fullPath.endsWith(`/${skillId}.md`)) {
          return fullPath;
        }
      }
    }
  }
  return null;
}

export function buildExplicitSkill(skillId: string): {
  skill: Skill;
  record: SkillRecord;
} {
  const skillPath = findEvaluationSkillPath(skillId);
  if (!skillPath) {
    throw new Error(`Evaluation skill '${skillId}' could not be resolved from local assets.`);
  }
  const skill = load_skill_from_path(skillPath);
  return {
    skill,
    record: buildStrategySkillRecord(skill, skillId),
  };
}

export function buildPackageSkill(item: ResolvedContextPackage): {
  skill: Skill;
  record: SkillRecord;
} {
  const entryPath = resolveAssetPath(item.entry);
  const lowerName = basename(entryPath).toLowerCase();
  let skill: Skill;

  if (item.kind === "repo-policy" || lowerName === "agents.md") {
    skill = {
      name: item.name || item.ref,
      content: item.content,
      source: entryPath,
      trigger: null,
      description: item.description,
      isAgentSkillsFormat: false,
      license: null,
      compatibility: null,
      metadata: null,
      allowed_tools: null,
      mcp_tools: null,
      resources: null,
    };
  } else {
    const loaded = load_skill_from_path(entryPath);
    skill = {
      ...loaded,
      source: entryPath,
      description: loaded.description || item.description,
    };
  }

  return {
    skill,
    record: buildPackageSkillRecord(item, skill),
  };
}
