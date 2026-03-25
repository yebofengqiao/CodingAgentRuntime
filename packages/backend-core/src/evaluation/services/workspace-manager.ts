import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { minimatch } from "minimatch";

import { settings } from "../../config/settings";
import type { CaseDefinition, CommandOutcome, ScopeAudit } from "../schemas";

export type WorkspaceHandle = {
  runId: string;
  repoPath: string;
  workspacePath: string;
  ref: string;
  env: Record<string, string>;
};

function runGit(repoPath: string, args: string[]): void {
  execSync(["git", "-C", repoPath, ...args].join(" "), {
    stdio: "pipe",
    encoding: "utf-8",
  });
}

function matchesAny(path: string, patterns: string[]): boolean {
  const normalized = path.replace(/\\/g, "/");
  return patterns.some((pattern) => minimatch(normalized, pattern));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isManagedWorkspaceFile(path: string): boolean {
  return path === ".evaluation-workspace.json";
}

function listTrackedChangedFiles(handle: WorkspaceHandle): string[] {
  const outcome = runShell(handle, "git diff --name-only --relative", 60);
  return outcome.stdout
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item && !isManagedWorkspaceFile(item));
}

function listUntrackedFiles(handle: WorkspaceHandle): string[] {
  const outcome = runShell(handle, "git ls-files --others --exclude-standard", 60);
  return outcome.stdout
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item && !isManagedWorkspaceFile(item));
}

function listWorkspaceChangedFiles(handle: WorkspaceHandle): string[] {
  return Array.from(new Set([...listTrackedChangedFiles(handle), ...listUntrackedFiles(handle)])).sort();
}

export function resolveRepoPath(repoPath: string): string {
  return repoPath.startsWith("/") ? repoPath : resolve(settings.evaluationAssetsRoot, repoPath);
}

export function prepareWorkspace(runId: string, caseDefinition: CaseDefinition): WorkspaceHandle {
  const repoPath = resolveRepoPath(caseDefinition.code_state_ref.repo_path);
  if (!existsSync(repoPath)) {
    throw new Error(`Repository path does not exist: ${repoPath}`);
  }

  runGit(repoPath, ["rev-parse", "--show-toplevel"]);
  runGit(repoPath, ["worktree", "prune"]);

  const workspacePath = resolve(settings.workspaceRoot, runId);
  rmSync(workspacePath, { recursive: true, force: true });
  runGit(repoPath, ["worktree", "add", "--detach", workspacePath, caseDefinition.code_state_ref.ref]);

  const handle: WorkspaceHandle = {
    runId,
    repoPath,
    workspacePath,
    ref: caseDefinition.code_state_ref.ref,
    env: caseDefinition.code_state_ref.env,
  };

  for (const installCommand of caseDefinition.code_state_ref.install) {
    runShell(handle, installCommand);
  }

  writeFileSync(
    resolve(workspacePath, ".evaluation-workspace.json"),
    `${JSON.stringify(
      {
        run_id: runId,
        repo_path: repoPath,
        workspace_path: workspacePath,
        ref: caseDefinition.code_state_ref.ref,
        env: caseDefinition.code_state_ref.env,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  return handle;
}

export function cleanupWorkspace(handle: WorkspaceHandle): void {
  try {
    runGit(handle.repoPath, ["worktree", "remove", "--force", handle.workspacePath]);
    runGit(handle.repoPath, ["worktree", "prune"]);
  } catch {
    rmSync(handle.workspacePath, { recursive: true, force: true });
  }
}

export function runShell(
  handle: WorkspaceHandle,
  command: string,
  timeoutSeconds = 120,
  extraEnv: Record<string, string> = {},
): CommandOutcome {
  const startedAt = performance.now();
  try {
    const stdout = execSync(command, {
      cwd: handle.workspacePath,
      stdio: "pipe",
      encoding: "utf-8",
      timeout: timeoutSeconds * 1000,
      env: {
        ...process.env,
        ...handle.env,
        ...extraEnv,
      },
    });
    return {
      cmd: command,
      exit_code: 0,
      duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(4)),
      stdout: stdout.trim(),
      stderr: "",
    };
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    return {
      cmd: command,
      exit_code: err.status ?? 1,
      duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(4)),
      stdout: String(err.stdout ?? "").trim(),
      stderr: String(err.stderr ?? "").trim(),
    };
  }
}

export function exportWorkspaceDiff(handle: WorkspaceHandle, outputPath: string): void {
  const trackedDiff = runShell(handle, "git diff --binary --relative", 120).stdout;
  const untrackedDiffs = listUntrackedFiles(handle)
    .map((path) => runShell(handle, `git diff --binary --no-index -- /dev/null ${shellQuote(path)}`, 120))
    .map((outcome) => outcome.stdout)
    .filter(Boolean);
  writeFileSync(outputPath, [trackedDiff, ...untrackedDiffs].filter(Boolean).join("\n"), "utf-8");
}

export function buildScopeAudit(handle: WorkspaceHandle, caseDefinition: CaseDefinition): ScopeAudit {
  const changedFiles = listWorkspaceChangedFiles(handle);
  const protectedViolations = changedFiles.filter((path) =>
    matchesAny(path, caseDefinition.scope.protected_scope),
  );
  const outsideEditableScope = changedFiles.filter(
    (path) =>
      caseDefinition.scope.editable_scope.length > 0 &&
      !matchesAny(path, caseDefinition.scope.editable_scope),
  );

  return {
    changed_files: changedFiles,
    protected_violations: protectedViolations,
    outside_editable_scope: outsideEditableScope,
    scope_ok: protectedViolations.length === 0 && outsideEditableScope.length === 0,
  };
}
