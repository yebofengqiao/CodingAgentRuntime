import {
  build_system_prompt_event,
  build_user_message_event,
  get_message_text,
  type ResolvedRuntimeContext,
} from "@openhands-rl/runtime-core/runtime";

import type { JsonRecord } from "../../shared";
import type { PromptBundle } from "../schemas";
import { snapshotSkill } from "../services/skill-telemetry";

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderXmlTag(tag: string, content: string): string {
  const trimmed = content.trim();
  return `<${tag}>\n${trimmed || "(none)"}\n</${tag}>`;
}

function buildResolvedRuntimeContextSnapshot(runtimeContext: ResolvedRuntimeContext): JsonRecord {
  return {
    context_root: runtimeContext.context_root,
    platform_context_root: runtimeContext.platform_context_root,
    workspace_context_root: runtimeContext.workspace_context_root,
    base_system_prompt: runtimeContext.base_system_prompt,
    system_message_suffix: runtimeContext.system_message_suffix,
    user_message_suffix: runtimeContext.user_message_suffix,
    current_datetime: runtimeContext.current_datetime,
    condenser: runtimeContext.condenser,
    skills: runtimeContext.skills.map((skill) => snapshotSkill(skill)),
  };
}

export function buildExecutorSnapshots(
  promptBundle: PromptBundle,
  runtimeContext: ResolvedRuntimeContext,
  workspacePath: string,
): {
  system_prompt_snapshot: string;
  runtime_context_snapshot: JsonRecord;
} {
  const systemPromptEvent = build_system_prompt_event({
    runtime_context: runtimeContext,
    working_dir: workspacePath,
  });
  const userMessageEvent = build_user_message_event({
    raw_text: promptBundle.user_message,
    prior_events: [systemPromptEvent],
    runtime_context: runtimeContext,
    skip_skill_names: [],
  });

  const systemPromptText = systemPromptEvent.payload.system_prompt.text ?? "";
  const dynamicContextText = systemPromptEvent.payload.dynamic_context?.text ?? "";
  const userMessageText = get_message_text(userMessageEvent.payload);

  return {
    system_prompt_snapshot: [
      renderXmlTag("SYSTEM_PROMPT", escapeXmlText(systemPromptText)),
      renderXmlTag("DYNAMIC_CONTEXT", dynamicContextText),
      renderXmlTag("USER_MESSAGE", userMessageText),
    ].join("\n\n"),
    runtime_context_snapshot: {
      resolved_runtime_context: buildResolvedRuntimeContextSnapshot(runtimeContext),
      case_context: promptBundle.case_context,
      package_telemetry: {
        configured_packages: promptBundle.configured_packages,
        loaded_packages: promptBundle.loaded_packages,
        loaded_skills: promptBundle.loaded_skills,
        loaded_skill_records: promptBundle.loaded_skill_records,
        context_packages: promptBundle.resolved_strategy.resolved_context_packages.map((item) => ({
          ref: item.ref,
          kind: item.kind,
          entry: item.entry,
          owner: item.owner,
          tags: item.tags,
          source_path: item.source_path ?? null,
        })),
      },
      evaluation_contract: promptBundle.evaluation_contract,
    },
  };
}
