import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  CaseDefinition,
  CompletionCheckOutcome,
  ExecutorRunResult,
  JudgeOutcome,
} from "../schemas";
import { buildScopeAudit, runShell, type WorkspaceHandle } from "./workspace-manager";

const SCRIPT_LAUNCHERS = new Set([
  "bash",
  "bun",
  "node",
  "python",
  "python3",
  "sh",
  "tsx",
  "zsh",
]);

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveCheckPath(workspace: WorkspaceHandle, rawPath: string): string {
  if (!rawPath || rawPath.startsWith("-") || rawPath.startsWith("/")) {
    return rawPath;
  }
  const workspaceCandidate = resolve(workspace.workspacePath, rawPath);
  if (existsSync(workspaceCandidate)) {
    return rawPath;
  }
  const repoCandidate = resolve(workspace.repoPath, rawPath);
  return existsSync(repoCandidate) ? repoCandidate : rawPath;
}

function rewriteCompletionCheckCommand(
  workspace: WorkspaceHandle,
  command: string,
): string {
  const trimmed = command.trim();
  if (!trimmed) {
    return command;
  }

  const launcherMatch = trimmed.match(/^(\S+)\s+(\S+)([\s\S]*)$/);
  if (launcherMatch && SCRIPT_LAUNCHERS.has(launcherMatch[1])) {
    const resolvedPath = resolveCheckPath(workspace, launcherMatch[2]);
    if (resolvedPath !== launcherMatch[2]) {
      return `${launcherMatch[1]} ${shellQuote(resolvedPath)}${launcherMatch[3]}`;
    }
    return command;
  }

  const directMatch = trimmed.match(/^(\S+)([\s\S]*)$/);
  if (!directMatch) {
    return command;
  }

  const resolvedPath = resolveCheckPath(workspace, directMatch[1]);
  if (resolvedPath !== directMatch[1]) {
    return `${shellQuote(resolvedPath)}${directMatch[2]}`;
  }
  return command;
}

function runCompletionCheck(
  workspace: WorkspaceHandle,
  check: CaseDefinition["completion_checks"][number],
  executorResult: ExecutorRunResult,
): CompletionCheckOutcome {
  if (check.type === "shell" || check.type === "script") {
    const command = rewriteCompletionCheckCommand(workspace, check.command ?? "");
    const outcome = runShell(
      workspace,
      command,
      Math.min(Math.max(10, 120), 120),
    );
    return {
      name: check.name,
      type: check.type,
      passed: outcome.exit_code === 0,
      details: [outcome.stdout, outcome.stderr].filter(Boolean).join(" | ") || "No output",
      exit_code: outcome.exit_code,
    };
  }

  if (check.type === "artifact_exists") {
    const target = resolve(workspace.workspacePath, check.path ?? "");
    const passed = existsSync(target);
    return {
      name: check.name,
      type: check.type,
      passed,
      details: passed ? `Artifact exists: ${check.path}` : `Artifact missing: ${check.path}`,
      exit_code: passed ? 0 : 1,
    };
  }

  if (check.type === "artifact_contains") {
    const target = resolve(workspace.workspacePath, check.path ?? "");
    const content = existsSync(target) ? readFileSync(target, "utf-8") : "";
    const needle = check.contains ?? "";
    const passed = Boolean(content) && content.includes(needle);
    return {
      name: check.name,
      type: check.type,
      passed,
      details: passed
        ? `Artifact contains expected text: ${needle}`
        : `Artifact does not contain expected text: ${needle}`,
      exit_code: passed ? 0 : 1,
    };
  }

  const keyword = check.keyword ?? "";
  const haystack = [
    executorResult.final_message,
    ...executorResult.trace.map((event) => String(event.summary ?? event.kind ?? "")),
  ]
    .join("\n")
    .toLowerCase();
  const passed = keyword ? haystack.includes(keyword.toLowerCase()) : false;
  return {
    name: check.name,
    type: check.type,
    passed,
    details: passed ? `Keyword present: ${keyword}` : `Keyword missing: ${keyword}`,
    exit_code: passed ? 0 : 1,
  };
}

export function runJudge(
  caseDefinition: CaseDefinition,
  workspace: WorkspaceHandle,
  executorResult: ExecutorRunResult,
): JudgeOutcome {
  const checks = caseDefinition.completion_checks.map((check) =>
    runCompletionCheck(workspace, check, executorResult),
  );
  const scopeAudit = buildScopeAudit(workspace, caseDefinition);
  const checkByName = new Map(checks.map((check) => [check.name, check]));
  const validationCommands = caseDefinition.completion_checks
    .filter((check) => check.type === "shell" || check.type === "script")
    .map((check) => ({
      name: check.name,
      command: check.command ?? "",
    }));
  const validationsRun = executorResult.validations_run.map((item) => item.toLowerCase());
  const validationViolations = validationCommands.filter(
    ({ name, command }) =>
      command &&
      !validationsRun.some((item) => item.includes(command.toLowerCase())) &&
      checkByName.get(name)?.passed === false,
  );

  return {
    success: checks.every((check) => check.passed) && scopeAudit.scope_ok,
    checks,
    scope_violation: !scopeAudit.scope_ok,
    validation_violations: validationViolations.map(({ command }) => command.toLowerCase()),
    scope_audit: scopeAudit,
  };
}
