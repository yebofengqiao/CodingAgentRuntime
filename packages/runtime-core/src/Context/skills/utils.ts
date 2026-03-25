import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, relative, resolve } from "node:path";

import YAML from "js-yaml";

import type { SkillResources } from "./types";

export const THIRD_PARTY_SKILL_NAMES: Record<string, string> = {
  "agents.md": "agents",
  "agent.md": "agents",
  ".cursorrules": "cursorrules",
  "claude.md": "claude",
  "gemini.md": "gemini",
};

export const USER_SKILLS_SUBDIRS = [
  [".agents", "skills"],
  [".openhands", "skills"],
  [".openhands", "microagents"],
] as const;

export const PROJECT_SKILLS_SUBDIRS = USER_SKILLS_SUBDIRS;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class SkillValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillValidationError";
  }
}

export function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseFrontmatter(fileContent: string): {
  attributes: Record<string, unknown>;
  body: string;
} {
  const match = fileContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return {
      attributes: {},
      body: fileContent,
    };
  }

  const loaded = YAML.load(match[1]);
  if (loaded == null) {
    return {
      attributes: {},
      body: match[2],
    };
  }
  if (typeof loaded !== "object" || Array.isArray(loaded)) {
    throw new SkillValidationError("Frontmatter must be a YAML object");
  }
  return {
    attributes: loaded as Record<string, unknown>,
    body: match[2],
  };
}

export function inferDescription(content: string): string | null {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));
  if (lines.length === 0) {
    return null;
  }
  return lines[0];
}

export function normalizeOptionalString(value: unknown, fieldName: string): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new SkillValidationError(`${fieldName} must be a string`);
}

export function normalizeStringList(value: unknown, fieldName: string): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new SkillValidationError(`${fieldName} must be a list of strings`);
  }
  return Array.from(
    new Set(
      value.map((item) => {
        if (typeof item !== "string") {
          throw new SkillValidationError(`${fieldName} must be a list of strings`);
        }
        return item.trim();
      }),
    ),
  ).filter(Boolean);
}

export function normalizeStringRecord(
  value: unknown,
  fieldName: string,
): Record<string, string> | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new SkillValidationError(`${fieldName} must be an object`);
  }
  const normalized: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry == null) {
      normalized[String(key)] = "";
      continue;
    }
    if (
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    ) {
      throw new SkillValidationError(`${fieldName} values must be strings`);
    }
    normalized[String(key)] = String(entry);
  }
  return normalized;
}

export function normalizeMcpTools(
  value: unknown,
  fieldName: string,
): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new SkillValidationError(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function normalizeAllowedTools(
  attributes: Record<string, unknown>,
): string[] | null {
  const raw = attributes["allowed-tools"] ?? attributes.allowed_tools;
  if (raw == null) {
    return null;
  }
  if (typeof raw === "string") {
    return raw
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return normalizeStringList(raw, "allowed_tools");
}

export function validateAgentSkillName(name: string, directoryName: string): void {
  if (!name) {
    throw new SkillValidationError("Skill name cannot be empty");
  }
  if (name.length > 64) {
    throw new SkillValidationError("Skill name exceeds 64 characters");
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new SkillValidationError(
      "Skill name must use lowercase alphanumeric characters and single hyphens",
    );
  }
  if (name !== directoryName) {
    throw new SkillValidationError(
      `Skill name '${name}' does not match directory '${directoryName}'`,
    );
  }
}

export function collectResourceFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const results: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = resolve(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectResourceFiles(fullPath));
      continue;
    }
    results.push(fullPath);
  }
  return results.sort();
}

export function buildSkillResources(skillRoot: string): SkillResources | null {
  const scriptsDir = resolve(skillRoot, "scripts");
  const referencesDir = resolve(skillRoot, "references");
  const assetsDir = resolve(skillRoot, "assets");

  const scripts = collectResourceFiles(scriptsDir).map((path) => path.replace(`${skillRoot}/`, ""));
  const references = collectResourceFiles(referencesDir).map((path) =>
    path.replace(`${skillRoot}/`, ""),
  );
  const assets = collectResourceFiles(assetsDir).map((path) => path.replace(`${skillRoot}/`, ""));

  if (scripts.length === 0 && references.length === 0 && assets.length === 0) {
    return null;
  }

  return {
    skillRoot,
    scripts,
    references,
    assets,
  };
}

export function findMcpConfig(skillRoot: string): string | null {
  const mcpConfigPath = resolve(skillRoot, ".mcp.json");
  return existsSync(mcpConfigPath) ? mcpConfigPath : null;
}

export function loadMcpConfig(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    throw new SkillValidationError(
      `Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return normalizeMcpTools(parsed, ".mcp.json");
}

export function toRelativeSkillName(path: string, skillBaseDir?: string): string {
  if (!skillBaseDir) {
    const suffix = path.endsWith(".md") ? 3 : 0;
    return basename(path, suffix > 0 ? ".md" : undefined);
  }
  const relativePath = relative(skillBaseDir, path);
  return relativePath.replace(/\.md$/i, "") || basename(path).replace(/\.md$/i, "");
}

function isRelativeTo(path: string, root: string): boolean {
  const value = relative(root, path);
  return value === "" || (!value.startsWith("..") && !value.startsWith("../"));
}

export function findSkillMarkdownInDirectory(dir: string): string | null {
  if (!existsSync(dir)) {
    return null;
  }
  const entries = readdirSync(dir).sort((a, b) => a.localeCompare(b));
  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    if (!statSync(fullPath).isFile()) {
      continue;
    }
    if (entry.toLowerCase() === "skill.md") {
      return fullPath;
    }
  }
  return null;
}

export function findSkillMarkdownDirectories(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const results: string[] = [];
  const entries = readdirSync(root).sort((a, b) => a.localeCompare(b));
  for (const entry of entries) {
    const fullPath = resolve(root, entry);
    if (!statSync(fullPath).isDirectory()) {
      continue;
    }
    const skillFile = findSkillMarkdownInDirectory(fullPath);
    if (skillFile) {
      results.push(skillFile);
    }
  }
  return results;
}

export function findRegularMarkdownFiles(root: string, excludedDirs: string[]): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const results: string[] = [];
  const entries = readdirSync(root).sort((a, b) => a.localeCompare(b));
  for (const entry of entries) {
    const fullPath = resolve(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (excludedDirs.some((dir) => isRelativeTo(fullPath, dir))) {
        continue;
      }
      results.push(...findRegularMarkdownFiles(fullPath, excludedDirs));
      continue;
    }
    const lowerName = entry.toLowerCase();
    if (
      lowerName === "readme.md" ||
      lowerName === "skill.md" ||
      !lowerName.endsWith(".md")
    ) {
      continue;
    }
    if (excludedDirs.some((dir) => isRelativeTo(fullPath, dir))) {
      continue;
    }
    results.push(fullPath);
  }
  return results;
}

export function findThirdPartyFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const found: string[] = [];
  const seenNames = new Set<string>();
  const entries = readdirSync(root).sort((a, b) => a.localeCompare(b));
  for (const entry of entries) {
    const fullPath = resolve(root, entry);
    if (!statSync(fullPath).isFile()) {
      continue;
    }
    const lowerName = entry.toLowerCase();
    if (!(lowerName in THIRD_PARTY_SKILL_NAMES) || seenNames.has(lowerName)) {
      continue;
    }
    seenNames.add(lowerName);
    found.push(fullPath);
  }
  return found;
}

export function findGitRepoRoot(path: string): string | null {
  let current = resolve(path);
  while (true) {
    if (existsSync(resolve(current, ".git"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function resolveUserHome(homeDir?: string): string {
  const preferred = trimString(homeDir) || trimString(process.env.HOME) || homedir();
  return resolve(preferred);
}
