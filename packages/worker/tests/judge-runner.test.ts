import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getCase } from "@openhands-rl/backend-core/evaluation/catalog";
import { runJudge } from "@openhands-rl/backend-core/evaluation/services/judge-runner";
import type { ExecutorRunResult } from "@openhands-rl/backend-core/evaluation/schemas";
import type { WorkspaceHandle } from "@openhands-rl/backend-core/evaluation/services/workspace-manager";
import { settings } from "@openhands-rl/backend-core/config";

const workspaces: string[] = [];

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "judge-runner-"));
  workspaces.push(workspace);
  return workspace;
}

function createGitWorkspace(): string {
  const workspace = createWorkspace();
  execSync("git init -b main", { cwd: workspace, stdio: "pipe" });
  execSync('git config user.email "judge@example.com"', { cwd: workspace, stdio: "pipe" });
  execSync('git config user.name "Judge Runner"', { cwd: workspace, stdio: "pipe" });
  return workspace;
}

function createExecutorResult(): ExecutorRunResult {
  return {
    trace: [],
    metrics: {},
    finish_reason: "completed",
    final_message: "",
    validations_run: [],
    changed_files_hint: [],
    used_tools: [],
    repeated_actions: 0,
    skill_events: [],
    package_observations: [],
    system_prompt_snapshot: "",
    runtime_context_snapshot: {},
  };
}

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop()!, { recursive: true, force: true });
  }
});

describe("judge runner", () => {
  it("falls back to source repo scripts when a worktree omits untracked judge helpers", () => {
    const workspacePath = createGitWorkspace();
    const targetDir = join(workspacePath, "apps/demo-shop/src/pages/button-lab");
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(
      join(targetDir, "index.tsx"),
      [
        "import { Button } from '../../../packages/ui/Button';",
        "",
        "export function ButtonLab() {",
        "  return <Button>Checkout</Button>;",
        "}",
        "",
      ].join("\n"),
      "utf-8",
    );
    execSync("git add .", { cwd: workspacePath, stdio: "pipe" });
    execSync('git commit -m "init"', { cwd: workspacePath, stdio: "pipe" });

    const baseCase = getCase("FE_BUTTON_01");
    const caseDefinition = {
      ...baseCase,
      completion_checks: [
        {
          name: "button_component_usage",
          type: "shell" as const,
          command:
            "node scripts/check-button-usage.js FE_BUTTON_01 apps/demo-shop/src/pages/button-lab/index.tsx",
        },
      ],
    };
    const workspace: WorkspaceHandle = {
      runId: "judge-test",
      repoPath: join(settings.evaluationAssetsRoot, "repos/demo-shop"),
      workspacePath,
      ref: "main",
      env: {},
    };

    const outcome = runJudge(caseDefinition, workspace, createExecutorResult());

    expect(outcome.success).toBe(true);
    expect(outcome.checks[0]).toMatchObject({
      name: "button_component_usage",
      passed: true,
      exit_code: 0,
    });
    expect(outcome.checks[0].details).toContain("button usage ok for FE_BUTTON_01");
  });
});
