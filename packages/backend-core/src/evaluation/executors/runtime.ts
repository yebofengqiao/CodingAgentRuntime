import {
  Conversation,
  ConversationState,
  build_system_prompt_event,
  build_user_message_event,
  get_message_role,
  get_message_text,
  resolve_runtime_context,
  type Event,
} from "@openhands-rl/runtime-core/runtime";

import { settings } from "../../config/settings";
import type { JsonRecord } from "../../shared";
import type {
  CaseDefinition,
  ExecutorRunResult,
  PromptBundle,
  ResolvedStrategyBundle,
} from "../schemas";
import { buildExecutorSnapshots } from "./snapshot-builder";
import {
  buildActivatedSkillEvents,
  buildPackageObservations,
} from "./skill-activation";

function llmConfigFromSettings(modelOverride?: string) {
  if (!settings.llmApiKey) {
    throw new Error("LLM_API_KEY environment variable is required.");
  }
  return {
    apiKey: settings.llmApiKey,
    model: modelOverride || settings.llmModel,
    baseUrl: settings.llmBaseUrl || undefined,
  };
}

function deriveExecutorResultFromConversationEvents(
  caseId: string,
  variantId: string,
  events: Event[],
  options?: {
    timedOut?: boolean;
    wallClockSeconds?: number;
    systemPromptSnapshot?: string;
    runtimeContextSnapshot?: JsonRecord;
  },
): ExecutorRunResult {
  const usedTools: string[] = [];
  const validationsRun: string[] = [];
  let finalMessage = "";
  let repeatedActions = 0;
  let lastCommand: string | null = null;
  let repeatCount = 0;

  const trace = events.map((event) => {
    if (event.kind === "action" && typeof event.payload.tool_name === "string") {
      if (!usedTools.includes(event.payload.tool_name)) {
        usedTools.push(event.payload.tool_name);
      }
      if (
        event.payload.tool_name === "terminal" &&
        event.payload.arguments &&
        typeof event.payload.arguments === "object" &&
        typeof (event.payload.arguments as Record<string, unknown>).command === "string"
      ) {
        const command = String((event.payload.arguments as Record<string, unknown>).command);
        validationsRun.push(command);
        if (command === lastCommand) {
          repeatCount += 1;
          repeatedActions = Math.max(repeatedActions, repeatCount - 1);
        } else {
          lastCommand = command;
          repeatCount = 1;
        }
      }
    }
    if (
      event.kind === "message" &&
      get_message_role(event.payload) === "assistant"
    ) {
      finalMessage = get_message_text(event.payload);
    }
    return {
      kind: event.kind,
      source: event.source,
      payload: event.payload,
      id: event.id,
      timestamp: event.timestamp,
      tool_name:
        typeof event.payload.tool_name === "string" ? event.payload.tool_name : undefined,
      arguments:
        event.payload.arguments && typeof event.payload.arguments === "object"
          ? event.payload.arguments
          : undefined,
      summary:
        typeof event.payload.summary === "string"
          ? event.payload.summary
          : event.kind === "message"
            ? get_message_text(event.payload)
            : event.kind,
    } satisfies JsonRecord;
  });

  return {
    trace,
    metrics: {
      steps: trace.length,
      tool_calls: trace.filter((item) => item.kind === "action").length,
      repeated_actions: repeatedActions,
      wall_clock_seconds: options?.wallClockSeconds ?? 0,
      prompt_tokens: 1,
      completion_tokens: Math.max(Math.floor(finalMessage.length / 4), 1),
      cost_usd: 0,
      case_id: caseId,
      variant_id: variantId,
    },
    finish_reason: options?.timedOut
      ? "timeout"
      : events.find((event) => event.kind === "conversation_error") != null
        ? "error"
        : "completed",
    final_message: finalMessage || `Runtime executor completed ${caseId}.`,
    validations_run: validationsRun,
    changed_files_hint: [],
    used_tools: usedTools,
    repeated_actions: repeatedActions,
    skill_events: [],
    package_observations: [],
    system_prompt_snapshot: options?.systemPromptSnapshot ?? "",
    runtime_context_snapshot: options?.runtimeContextSnapshot ?? {},
  };
}

export async function runRuntimeExecutor(
  caseDefinition: CaseDefinition,
  strategy: ResolvedStrategyBundle,
  promptBundle: PromptBundle,
  workspacePath: string,
): Promise<ExecutorRunResult> {
  const startedAt = performance.now();
  const wallClockBudgetSeconds = Math.max(caseDefinition.budgets.max_wall_clock_seconds || 0, 1);
  const deadlineAt = Date.now() + wallClockBudgetSeconds * 1000;
  let timedOut = false;
  const runtime_context_config = {
    ...promptBundle.runtime_context,
    platform_context_root: settings.platformContextRoot,
    workspace_context_root: workspacePath,
  };
  const resolved_runtime_context = resolve_runtime_context(runtime_context_config, workspacePath);
  const snapshots = buildExecutorSnapshots(promptBundle, resolved_runtime_context, workspacePath);

  const state = ConversationState.create(caseDefinition.budgets.max_steps || 50);
  state.events = [
    build_system_prompt_event({
      runtime_context: resolved_runtime_context,
      working_dir: workspacePath,
    }),
  ];
  state.events.push(
    build_user_message_event({
      raw_text: promptBundle.user_message,
      prior_events: state.events,
      runtime_context: resolved_runtime_context,
      skip_skill_names: state.activated_knowledge_skills,
    }),
  );

  const emittedEvents: Event[] = [...state.events];
  await Conversation.run({
    state,
    workspace_dir: workspacePath,
    llm_config: llmConfigFromSettings(strategy.model.name || undefined),
    runtime_context: runtime_context_config,
    cancel_requested: () => {
      if (Date.now() >= deadlineAt) {
        timedOut = true;
        return true;
      }
      return false;
    },
    on_event: async (event) => {
      emittedEvents.push(event);
    },
  });
  const wallClockSeconds = Number(((performance.now() - startedAt) / 1000).toFixed(4));
  const result = deriveExecutorResultFromConversationEvents(
    caseDefinition.id,
    strategy.variant_id,
    emittedEvents,
    {
      timedOut,
      wallClockSeconds,
      systemPromptSnapshot: snapshots.system_prompt_snapshot,
      runtimeContextSnapshot: snapshots.runtime_context_snapshot,
    },
  );
  result.skill_events = buildActivatedSkillEvents(promptBundle, emittedEvents, workspacePath);
  result.package_observations =
    strategy.kind === "business_fine_tuning"
      ? buildPackageObservations(promptBundle, result.skill_events)
      : [];
  return result;
}
