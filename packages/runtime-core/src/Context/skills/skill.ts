import { basename, resolve } from "node:path";
import { readFileSync } from "node:fs";

import type { Skill, SkillResources, SkillTrigger } from "./types";
import {
  PROJECT_SKILLS_SUBDIRS,
  THIRD_PARTY_SKILL_NAMES,
  USER_SKILLS_SUBDIRS,
  SkillValidationError,
  buildSkillResources,
  findGitRepoRoot,
  findMcpConfig,
  findRegularMarkdownFiles,
  findSkillMarkdownDirectories,
  findThirdPartyFiles,
  inferDescription,
  loadMcpConfig,
  normalizeAllowedTools,
  normalizeMcpTools,
  normalizeOptionalString,
  normalizeStringList,
  normalizeStringRecord,
  parseFrontmatter,
  resolveUserHome,
  toRelativeSkillName,
  validateAgentSkillName,
} from "./utils";

function createTrigger(attributes: Record<string, unknown>): SkillTrigger {
  const keywords = normalizeStringList(attributes.triggers, "triggers");
  if (keywords.length === 0) {
    return null;
  }
  return {
    type: "keyword",
    keywords,
  };
}

function createSkillFromMetadata(input: {
  agentName: string;
  content: string;
  path: string;
  attributes: Record<string, unknown>;
  mcpTools?: Record<string, unknown> | null;
  resources?: SkillResources | null;
  isAgentSkillsFormat: boolean;
}): Skill {
  const {
    agentName,
    content,
    path,
    attributes,
    mcpTools = null,
    resources = null,
    isAgentSkillsFormat,
  } = input;

  if (attributes.inputs !== undefined) {
    throw new SkillValidationError("Task skills with inputs are not supported in runtime-core");
  }

  return {
    name: agentName,
    content,
    source: path,
    trigger: createTrigger(attributes),
    description:
      normalizeOptionalString(attributes.description, "description") ?? inferDescription(content),
    license: normalizeOptionalString(attributes.license, "license"),
    compatibility: normalizeOptionalString(attributes.compatibility, "compatibility"),
    metadata: normalizeStringRecord(attributes.metadata, "metadata"),
    allowed_tools: normalizeAllowedTools(attributes),
    mcp_tools: mcpTools,
    isAgentSkillsFormat,
    resources,
  };
}

function buildSkillFromFile(path: string, skillBaseDir?: string): Skill {
  const fileContent = readFileSync(path, "utf-8");
  const lowerName = basename(path).toLowerCase();
  const thirdPartyName = THIRD_PARTY_SKILL_NAMES[lowerName];

  if (thirdPartyName) {
    return {
      name: thirdPartyName,
      content: fileContent.trim(),
      source: path,
      trigger: null,
      isAgentSkillsFormat: false,
    };
  }

  const { attributes, body } = parseFrontmatter(fileContent);
  const normalizedContent = body.trim();

  if (lowerName === "skill.md") {
    const skillRoot = resolve(path, "..");
    const directoryName = basename(skillRoot);
    const agentName =
      normalizeOptionalString(attributes.name, "name") ?? directoryName;
    validateAgentSkillName(agentName, directoryName);
    const mcpConfigPath = findMcpConfig(skillRoot);
    return createSkillFromMetadata({
      agentName,
      content: normalizedContent,
      path,
      attributes,
      mcpTools: mcpConfigPath ? loadMcpConfig(mcpConfigPath) : null,
      resources: buildSkillResources(skillRoot),
      isAgentSkillsFormat: true,
    });
  }

  const derivedName = toRelativeSkillName(path, skillBaseDir);
  const agentName = normalizeOptionalString(attributes.name, "name") ?? derivedName;
  return createSkillFromMetadata({
    agentName,
    content: normalizedContent || fileContent.trim(),
    path,
    attributes,
    mcpTools: normalizeMcpTools(attributes.mcp_tools, "mcp_tools"),
    resources: null,
    isAgentSkillsFormat: false,
  });
}

function addSkillIfFirstSeen(
  skill: Skill,
  seenNames: Set<string>,
  target: Skill[],
): void {
  if (!skill.name || seenNames.has(skill.name)) {
    return;
  }
  seenNames.add(skill.name);
  target.push(skill);
}

function loadSkillBatch(
  path: string,
  target: Skill[],
  seenNames: Set<string>,
  skillBaseDir?: string,
): void {
  try {
    addSkillIfFirstSeen(buildSkillFromFile(path, skillBaseDir), seenNames, target);
  } catch (error) {
    console.warn(
      `Skipping invalid skill '${path}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function load_skills_from_dir(skill_dir: string): Skill[] {
  const root = resolve(skill_dir);
  const loaded: Skill[] = [];
  const seenNames = new Set<string>();
  const skillMarkdownFiles = findSkillMarkdownDirectories(root);
  const excludedDirs = skillMarkdownFiles.map((path) => resolve(path, ".."));
  const regularMarkdownFiles = findRegularMarkdownFiles(root, excludedDirs);

  for (const path of skillMarkdownFiles) {
    loadSkillBatch(path, loaded, seenNames, root);
  }
  for (const path of regularMarkdownFiles) {
    loadSkillBatch(path, loaded, seenNames, root);
  }

  return loaded;
}

export function load_project_skills(context_root: string): Skill[] {
  const root = resolve(context_root);
  const loaded: Skill[] = [];
  const seenNames = new Set<string>();
  const gitRoot = findGitRepoRoot(root);
  const searchRoots = [root, ...(gitRoot && gitRoot !== root ? [gitRoot] : [])];

  for (const searchRoot of searchRoots) {
    for (const path of findThirdPartyFiles(searchRoot)) {
      loadSkillBatch(path, loaded, seenNames);
    }
    for (const subdir of PROJECT_SKILLS_SUBDIRS) {
      for (const skill of load_skills_from_dir(resolve(searchRoot, ...subdir))) {
        addSkillIfFirstSeen(skill, seenNames, loaded);
      }
    }
  }

  return loaded;
}

export function load_user_skills(home_dir?: string): Skill[] {
  const root = resolveUserHome(home_dir);
  const loaded: Skill[] = [];
  const seenNames = new Set<string>();

  for (const subdir of USER_SKILLS_SUBDIRS) {
    for (const skill of load_skills_from_dir(resolve(root, ...subdir))) {
      addSkillIfFirstSeen(skill, seenNames, loaded);
    }
  }

  return loaded;
}

export function load_skill_from_path(path: string): Skill {
  return buildSkillFromFile(resolve(path));
}
