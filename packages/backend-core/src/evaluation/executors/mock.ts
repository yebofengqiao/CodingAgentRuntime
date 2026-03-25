import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

import {
  build_system_prompt_event,
  build_user_message_event,
  resolve_runtime_context,
  type Event,
} from "@openhands-rl/runtime-core/runtime";

import { settings } from "../../config/settings";
import { utcNow } from "../../shared";
import type {
  CaseDefinition,
  ExecutorRunResult,
  PromptBundle,
  ResolvedStrategyBundle,
} from "../schemas";
import { runShell, type WorkspaceHandle } from "../services/workspace-manager";
import { buildExecutorSnapshots } from "./snapshot-builder";
import {
  buildActivatedSkillEvents,
  buildPackageObservations,
} from "./skill-activation";

export function createMockExecutorResult(
  caseDefinition: CaseDefinition,
  strategy: ResolvedStrategyBundle,
  promptBundle: PromptBundle,
  workspace: WorkspaceHandle,
): ExecutorRunResult {
  const runtimeContextConfig = {
    ...promptBundle.runtime_context,
    platform_context_root: settings.platformContextRoot,
    workspace_context_root: workspace.workspacePath,
  };
  const resolvedRuntimeContext = resolve_runtime_context(runtimeContextConfig, workspace.workspacePath);
  const snapshots = buildExecutorSnapshots(promptBundle, resolvedRuntimeContext, workspace.workspacePath);
  const systemPromptEvent = build_system_prompt_event({
    runtime_context: resolvedRuntimeContext,
    working_dir: workspace.workspacePath,
  });
  const initialEvents: Event[] = [
    systemPromptEvent,
    build_user_message_event({
      raw_text: promptBundle.user_message,
      prior_events: [systemPromptEvent],
      runtime_context: resolvedRuntimeContext,
      skip_skill_names: [],
    }),
  ];
  const outputPath = resolve(workspace.workspacePath, ".evaluation", "mock-result.json");
  runShell(workspace, "mkdir -p .evaluation", 20);
  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        case_id: caseDefinition.id,
        variant_id: strategy.variant_id,
        project: caseDefinition.project,
        skills: promptBundle.loaded_skills,
        configured_packages: promptBundle.configured_packages,
        loaded_packages: promptBundle.loaded_packages,
        strategy_fingerprint: strategy.fingerprint,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  const trace: Record<string, unknown>[] = [
    {
      kind: "action",
      source: "agent",
      tool_name: "file_editor",
      arguments: {
        command: "write",
        path: ".evaluation/mock-result.json",
      },
      summary: "Write deterministic mock result payload",
      payload: {
        command: "write",
        path: ".evaluation/mock-result.json",
      },
      timestamp: utcNow().toISOString(),
    },
  ];

  const validationsRun: string[] = [];
  for (const check of caseDefinition.completion_checks) {
    const command =
      check.type === "shell" || check.type === "script" ? (check.command ?? "") : "";
    if (!command) {
      continue;
    }
    validationsRun.push(command);
    trace.push({
      kind: "action",
      source: "agent",
      tool_name: "terminal",
      arguments: { command },
      summary: `Validation before finish: ${command}`,
      payload: { command },
      timestamp: utcNow().toISOString(),
    });
  }

  trace.push({
    kind: "message",
    source: "agent",
    text: `Mock executor completed ${caseDefinition.id} with variant ${strategy.variant_id}.`,
    payload: {
      text: `Mock executor completed ${caseDefinition.id} with variant ${strategy.variant_id}.`,
    },
    timestamp: utcNow().toISOString(),
  });

  const skillEvents = buildActivatedSkillEvents(promptBundle, initialEvents, workspace.workspacePath);

  return {
    trace,
    metrics: {
      steps: trace.length,
      tool_calls: trace.filter((item) => item.kind === "action").length,
      repeated_actions: 0,
      wall_clock_seconds: 0,
      prompt_tokens: Math.max(Math.floor(snapshots.system_prompt_snapshot.length / 4), 1),
      completion_tokens: 64,
      cost_usd: 0,
    },
    finish_reason: "completed",
    final_message: `Mock executor completed ${caseDefinition.id}.`,
    validations_run: validationsRun,
    changed_files_hint: [".evaluation/mock-result.json"],
    used_tools: ["file_editor", "terminal"],
    repeated_actions: 0,
    skill_events: skillEvents,
    package_observations:
      strategy.kind === "business_fine_tuning"
        ? buildPackageObservations(promptBundle, skillEvents)
        : [],
    system_prompt_snapshot: snapshots.system_prompt_snapshot,
    runtime_context_snapshot: snapshots.runtime_context_snapshot,
  };
}
