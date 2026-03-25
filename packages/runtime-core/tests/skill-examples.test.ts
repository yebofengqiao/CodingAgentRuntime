import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  build_system_prompt_event,
  build_user_message_event,
  load_project_skills,
  resolve_runtime_context,
} from "../src/runtime";

const platform_context_root = resolve(
  process.cwd(),
  "..",
  "backend-core",
  "src",
  "context",
  "platform",
);

const workspaces: string[] = [];

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop()!, { recursive: true, force: true });
  }
});

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "runtime-core-platform-context-"));
  workspaces.push(workspace);
  return workspace;
}

describe("skill showcase examples", () => {
  it("loads the three framework categories with the expected shapes", () => {
    const skills = load_project_skills(platform_context_root);
    expect(skills.map((skill) => skill.name)).toEqual([
      "agents",
      "a11y-audit",
      "api-contracts",
      "locale-copy",
    ]);

    const repoGuidance = skills.find((skill) => skill.name === "agents");
    expect(repoGuidance?.trigger).toBeNull();
    expect(repoGuidance?.isAgentSkillsFormat).toBe(false);
    expect(repoGuidance?.content).toContain("Evaluation-Driven Coding Agent Runtime");

    const a11y = skills.find((skill) => skill.name === "a11y-audit");
    expect(a11y?.isAgentSkillsFormat).toBe(true);
    expect(a11y?.trigger).toEqual({
      type: "keyword",
      keywords: ["accessibility", "a11y", "screen reader"],
    });
    expect(a11y?.resources).toEqual({
      skillRoot: resolve(platform_context_root, ".agents", "skills", "a11y-audit"),
      scripts: ["scripts/list_a11y_targets.sh"],
      references: ["references/checklist.md"],
      assets: ["assets/review_template.md"],
    });

    const apiContracts = skills.find((skill) => skill.name === "api-contracts");
    expect(apiContracts?.trigger).toBeNull();
    expect(apiContracts?.isAgentSkillsFormat).toBe(false);

    const localeCopy = skills.find((skill) => skill.name === "locale-copy");
    expect(localeCopy?.trigger).toEqual({
      type: "keyword",
      keywords: ["locale", "i18n", "translation"],
    });
  });

  it("renders repo skill context and exposes triggered skills in the prompt flow", () => {
    const runtime_context = resolve_runtime_context(
      {
        platform_context_root,
        load_workspace_context: false,
      },
      platform_context_root,
    );
    const system_prompt = build_system_prompt_event({
      runtime_context,
      working_dir: platform_context_root,
    });

    expect(system_prompt.payload.dynamic_context?.text).toContain("[BEGIN context from agents]");
    expect(system_prompt.payload.dynamic_context?.text).toContain("[BEGIN context from api-contracts]");
    expect(system_prompt.payload.dynamic_context?.text).toContain("<available_skills>");
    expect(system_prompt.payload.dynamic_context?.text).toContain("locale-copy");
    expect(system_prompt.payload.dynamic_context?.text).toContain("a11y-audit");
    expect(system_prompt.payload.dynamic_context?.text).not.toContain("[BEGIN context from locale-copy]");

    const user_event = build_user_message_event({
      raw_text: "Please review accessibility issues and update locale copy on this screen.",
      prior_events: [system_prompt],
      runtime_context,
    });

    expect(user_event.payload.activated_skills).toEqual(["a11y-audit", "locale-copy"]);
    expect(user_event.payload.extended_content).toHaveLength(2);
    expect(user_event.payload.extended_content?.[0]?.text).toContain("# a11y-audit");
    expect(user_event.payload.extended_content?.[1]?.text).toContain("# locale-copy");
  });

  it("merges platform context with workspace context for business-side debugging", () => {
    const workspace = createWorkspace();
    mkdirSync(resolve(workspace, ".agents", "skills"), { recursive: true });
    writeFileSync(resolve(workspace, "AGENTS.md"), "# Business guide\nPrefer order-center patterns.\n");
    writeFileSync(
      resolve(workspace, ".agents", "skills", "analytics-workspace.md"),
      [
        "---",
        "description: Business repo analytics implementation guidance.",
        "triggers:",
        "  - analytics",
        "---",
        "# analytics-workspace",
        "",
        "Use the workspace analytics client before adding new SDK wrappers.",
      ].join("\n"),
      "utf-8",
    );

    const runtime_context = resolve_runtime_context(
      {
        platform_context_root,
        workspace_context_root: workspace,
        load_platform_context: true,
        load_workspace_context: true,
      },
      workspace,
    );
    const system_prompt = build_system_prompt_event({
      runtime_context,
      working_dir: workspace,
    });

    expect(system_prompt.payload.dynamic_context?.text).toContain("[BEGIN context from agents]");
    expect(system_prompt.payload.dynamic_context?.text).toContain(
      "[BEGIN context from api-contracts]",
    );
    expect(system_prompt.payload.dynamic_context?.text).toContain("analytics-workspace");
    expect(system_prompt.payload.dynamic_context?.text).not.toContain(
      "[BEGIN context from analytics-workspace]",
    );
    expect(system_prompt.payload.workspace_context_root).toBe(workspace);
    expect(system_prompt.payload.platform_context_root).toBe(platform_context_root);
  });
});
