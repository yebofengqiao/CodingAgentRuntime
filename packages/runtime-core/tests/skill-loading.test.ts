import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  load_project_skills,
  load_skill_from_path,
  load_skills_from_dir,
  load_user_skills,
  resolve_runtime_context,
  type Skill,
} from "../src/runtime";

const tempRoots: string[] = [];
const originalHome = process.env.HOME;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "runtime-core-skills-"));
  tempRoots.push(root);
  return root;
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

function skillsByName(skills: Skill[]): Map<string, Skill> {
  return new Map(skills.map((skill) => [skill.name, skill]));
}

afterEach(() => {
  process.env.HOME = originalHome;
  vi.restoreAllMocks();
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("skill loading", () => {
  it("loads AgentSkills and legacy skills from a directory while skipping invalid entries", () => {
    const root = createTempRoot();
    const skillsDir = resolve(root, "skills");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    writeFile(
      resolve(skillsDir, "pdf-tools", "SKILL.md"),
      [
        "---",
        "name: pdf-tools",
        "description: Extract text from PDF files.",
        "triggers:",
        "  - pdf",
        "compatibility: Requires pdftotext",
        "---",
        "# pdf-tools",
        "",
        "Use pdftotext to inspect PDFs.",
      ].join("\n"),
    );
    writeFile(
      resolve(skillsDir, "pdf-tools", ".mcp.json"),
      JSON.stringify({
        servers: {
          pdf: {
            command: "node",
            args: ["server.js"],
          },
        },
      }),
    );
    writeFile(resolve(skillsDir, "pdf-tools", "references", "checklist.md"), "reference");
    writeFile(resolve(skillsDir, "pdf-tools", "scripts", "run.sh"), "#!/bin/sh");
    writeFile(resolve(skillsDir, "pdf-tools", "assets", "sample.txt"), "asset");
    writeFile(resolve(skillsDir, "README.md"), "# ignored");
    writeFile(
      resolve(skillsDir, "legacy.md"),
      [
        "---",
        "description: Legacy locale guidance.",
        "triggers:",
        "  - locale",
        "allowed-tools: rg sed",
        "metadata:",
        "  owner: frontend",
        "mcp_tools:",
        "  local:",
        "    command: node",
        "---",
        "# legacy",
        "",
        "Reuse the locale bundle first.",
      ].join("\n"),
    );
    writeFile(
      resolve(skillsDir, "unsupported.md"),
      [
        "---",
        "name: unsupported",
        "inputs:",
        "  - name: target",
        "    description: target input",
        "---",
        "Task skill content",
      ].join("\n"),
    );
    writeFile(
      resolve(skillsDir, "BadSkill", "SKILL.md"),
      "# invalid because the directory name is not lowercase-kebab-case",
    );

    const loaded = load_skills_from_dir(skillsDir);
    expect(loaded.map((skill) => skill.name)).toEqual(["pdf-tools", "legacy"]);

    const byName = skillsByName(loaded);
    expect(byName.get("pdf-tools")).toMatchObject({
      isAgentSkillsFormat: true,
      trigger: { type: "keyword", keywords: ["pdf"] },
      compatibility: "Requires pdftotext",
      mcp_tools: {
        servers: {
          pdf: {
            command: "node",
            args: ["server.js"],
          },
        },
      },
      resources: {
        skillRoot: resolve(skillsDir, "pdf-tools"),
        references: ["references/checklist.md"],
        scripts: ["scripts/run.sh"],
        assets: ["assets/sample.txt"],
      },
    });
    expect(byName.get("legacy")).toMatchObject({
      isAgentSkillsFormat: false,
      trigger: { type: "keyword", keywords: ["locale"] },
      allowed_tools: ["rg", "sed"],
      metadata: { owner: "frontend" },
      mcp_tools: {
        local: {
          command: "node",
        },
      },
    });
  });

  it("loads project skills from the working directory first and still inherits repo-root skills", () => {
    const repoRoot = createTempRoot();
    const workDir = resolve(repoRoot, "packages", "feature");

    writeFile(resolve(repoRoot, ".git"), "gitdir: .git");
    writeFile(resolve(repoRoot, "AGENTS.md"), "# Repo guide\nUse repo defaults.\n");
    writeFile(resolve(workDir, "AGENTS.md"), "# Local guide\nUse local defaults.\n");
    writeFile(
      resolve(repoRoot, ".agents", "skills", "shared.md"),
      "---\nname: shared\n---\nrepo shared\n",
    );
    writeFile(
      resolve(repoRoot, ".agents", "skills", "repo-only.md"),
      "---\nname: repo-only\n---\nrepo only\n",
    );
    writeFile(
      resolve(workDir, ".agents", "skills", "shared.md"),
      "---\nname: shared\n---\nworkspace shared\n",
    );
    writeFile(
      resolve(workDir, ".openhands", "microagents", "legacy.md"),
      "---\nname: legacy\n---\nworkspace legacy\n",
    );

    const loaded = load_project_skills(workDir);
    const byName = skillsByName(loaded);

    expect(byName.get("agents")?.content).toContain("Local guide");
    expect(byName.get("shared")?.content).toContain("workspace shared");
    expect(byName.get("legacy")?.content).toContain("workspace legacy");
    expect(byName.get("repo-only")?.content).toContain("repo only");
  });

  it("loads user skills with directory precedence and merges runtime context in user < platform < workspace < explicit order", () => {
    const homeDir = createTempRoot();
    const platformRoot = createTempRoot();
    const workspaceRoot = createTempRoot();

    process.env.HOME = homeDir;

    writeFile(
      resolve(homeDir, ".agents", "skills", "shared.md"),
      "---\nname: shared\n---\nuser agents\n",
    );
    writeFile(
      resolve(homeDir, ".openhands", "skills", "shared.md"),
      "---\nname: shared\n---\nuser openhands\n",
    );
    writeFile(
      resolve(homeDir, ".openhands", "skills", "user-only.md"),
      "---\nname: user-only\n---\nuser only\n",
    );

    const userSkills = load_user_skills();
    expect(skillsByName(userSkills).get("shared")?.content).toContain("user agents");

    writeFile(
      resolve(platformRoot, ".agents", "skills", "shared.md"),
      "---\nname: shared\n---\nplatform shared\n",
    );
    writeFile(
      resolve(platformRoot, ".agents", "skills", "platform-only.md"),
      "---\nname: platform-only\n---\nplatform only\n",
    );
    writeFile(
      resolve(workspaceRoot, ".agents", "skills", "shared.md"),
      "---\nname: shared\n---\nworkspace shared\n",
    );
    writeFile(
      resolve(workspaceRoot, ".agents", "skills", "workspace-only.md"),
      "---\nname: workspace-only\n---\nworkspace only\n",
    );

    const runtimeContext = resolve_runtime_context(
      {
        load_user_skills: true,
        platform_context_root: platformRoot,
        workspace_context_root: workspaceRoot,
        load_platform_context: true,
        load_workspace_context: true,
        explicit_skills: [
          {
            name: "shared",
            content: "explicit shared",
            trigger: null,
          },
        ],
      },
      workspaceRoot,
    );

    const byName = skillsByName(runtimeContext.skills);
    expect(byName.get("shared")?.content).toBe("explicit shared");
    expect(byName.get("user-only")?.content).toContain("user only");
    expect(byName.get("platform-only")?.content).toContain("platform only");
    expect(byName.get("workspace-only")?.content).toContain("workspace only");
  });

  it("throws when directly loading a task skill with inputs", () => {
    const root = createTempRoot();
    const skillPath = resolve(root, "task.md");

    writeFile(
      skillPath,
      [
        "---",
        "name: task",
        "inputs:",
        "  - name: target",
        "    description: target input",
        "---",
        "Task skill content",
      ].join("\n"),
    );

    expect(() => load_skill_from_path(skillPath)).toThrow(
      /Task skills with inputs are not supported/,
    );
  });
});
