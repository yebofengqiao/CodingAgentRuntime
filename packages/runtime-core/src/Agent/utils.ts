import OpenAI from "openai";

import {
  build_system_prompt_event as build_system_prompt_event_from_context,
  build_user_message_event as build_user_message_event_from_context,
  default_base_system_prompt,
  type ResolvedRuntimeContext,
} from "../Context/context";
import { build_llm_view } from "../Context/condenser";
import {
  SystemPromptEvent,
  type Event,
  get_message_text,
  hydrate_event,
  is_llm_convertible_event,
  type JsonRecord,
} from "../Event/event";
import {
  ToolRuntime,
  type PlannedAction,
  type SecurityRisk,
  type ToolDefinition,
} from "../Tool/tool";
import type { LlmConfig } from "./base";

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export type ActionPlan = {
  thought: string;
  actions: PlannedAction[];
  assistantReply: string;
};

export type ActionPlanner = (
  tools_map: Record<string, ToolDefinition>,
  events: Event[],
  llm_config: LlmConfig,
) => Promise<ActionPlan>;

export function normalize_llm_model(model: string, base_url?: string | null): string {
  const trimmed = model.trim();
  if (!trimmed || !trimmed.includes("/")) {
    return trimmed;
  }

  let hostname = "";
  try {
    hostname = base_url ? new URL(base_url).hostname.toLowerCase() : "";
  } catch {
    hostname = "";
  }

  const slashIndex = trimmed.indexOf("/");
  const suffix = trimmed.slice(slashIndex + 1);
  const isThirdPartyCompatibleHost = hostname !== "" && hostname !== "api.openai.com";
  const isEndpointId = /^ep-[a-z0-9-]+$/i.test(suffix);

  if (isThirdPartyCompatibleHost && isEndpointId) {
    return suffix;
  }

  return trimmed;
}

export function build_system_prompt_event(input?: {
  runtime_context?: ResolvedRuntimeContext;
  working_dir?: string;
  tools?: ToolDefinition[];
  toolRuntime?: ToolRuntime;
}): SystemPromptEvent {
  return build_system_prompt_event_from_context({
    ...input,
    tools:
      input?.tools ??
      input?.toolRuntime?.get_tool_definitions() ??
      new ToolRuntime().get_tool_definitions(),
  });
}

export function build_user_message_event(input: {
  raw_text: string;
  prior_events: Event[];
  runtime_context: ResolvedRuntimeContext;
  skip_skill_names?: string[];
}): Event {
  return build_user_message_event_from_context(input);
}

export function prepare_llm_messages(events: Event[]): ChatMessage[] {
  const view = build_llm_view(events);
  const systemPromptEntry = view.find(
    (entry) => entry.type === "event" && entry.event.kind === "system_prompt",
  );
  const hydratedSystemPromptEvent =
    systemPromptEntry?.type === "event" ? hydrate_event(systemPromptEntry.event) : null;
  let initialSystemMessage: ChatMessage = {
    role: "system",
    content: [
      {
        type: "text",
        text: default_base_system_prompt(),
      },
    ],
  };
  if (hydratedSystemPromptEvent instanceof SystemPromptEvent) {
    if (hydratedSystemPromptEvent.content_blocks.length > 0) {
      initialSystemMessage = hydratedSystemPromptEvent.to_llm_message();
    }
  }

  const messages: ChatMessage[] = [
    initialSystemMessage,
  ];

  for (const entry of view) {
    if (entry.type === "summary") {
      messages.push({
        role: "assistant",
        content: `<CONTEXT_SUMMARY>\n${entry.text}\n</CONTEXT_SUMMARY>`,
      });
      continue;
    }

    const event = hydrate_event(entry.event);
    if (event.kind === "system_prompt") {
      continue;
    }

    if (is_llm_convertible_event(event)) {
      messages.push(event.to_llm_message());
    }
  }

  return messages;
}

export function normalize_security_risk(value: unknown): SecurityRisk {
  const normalized = typeof value === "string" ? value.toLowerCase() : "unknown";
  if (
    normalized === "low" ||
    normalized === "medium" ||
    normalized === "high" ||
    normalized === "unknown"
  ) {
    return normalized;
  }
  return "unknown";
}

function resolve_tools_map(
  toolsSource: ToolRuntime | Record<string, ToolDefinition>,
): Record<string, ToolDefinition> {
  return toolsSource instanceof ToolRuntime ? toolsSource.get_tool_definition_map() : toolsSource;
}

export function actions_from_tool_calls(
  toolsSource: ToolRuntime | Record<string, ToolDefinition>,
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[],
): PlannedAction[] {
  const actions: PlannedAction[] = [];
  const tools_map = resolve_tools_map(toolsSource);

  for (const toolCall of toolCalls) {
    if (toolCall.type !== "function" || !(toolCall.function.name in tools_map)) {
      continue;
    }

    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      if (!parsed || typeof parsed !== "object") {
        continue;
      }

      const record = { ...(parsed as Record<string, unknown>) };
      const summary =
        typeof record.summary === "string" && record.summary.trim()
          ? record.summary.trim()
          : `${toolCall.function.name}: ${JSON.stringify(record)}`;
      delete record.summary;

      const risk = normalize_security_risk(record.security_risk);
      delete record.security_risk;

      actions.push({
        tool_name: toolCall.function.name,
        arguments: record,
        summary,
        security_risk: risk,
      });
    } catch {
      continue;
    }
  }

  return actions;
}

export function parse_structured_payload(text: string): JsonRecord | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const candidates = [trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")];
  const match = candidates[0].match(/\{[\s\S]*\}/);
  if (match) {
    candidates.push(match[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonRecord;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function normalize_actions(
  toolRuntime: ToolRuntime,
  actionsRaw: unknown,
): PlannedAction[] {
  return normalize_actions_from_tools(resolve_tools_map(toolRuntime), actionsRaw);
}

export function normalize_actions_from_tools(
  tools_map: Record<string, ToolDefinition>,
  actionsRaw: unknown,
): PlannedAction[] {
  if (!Array.isArray(actionsRaw)) {
    return [];
  }

  const normalized: PlannedAction[] = [];
  for (const item of actionsRaw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const action = item as Record<string, unknown>;
    const toolName = typeof action.tool_name === "string" ? action.tool_name : null;
    const arguments_ =
      action.arguments && typeof action.arguments === "object" ? action.arguments : null;
    if (!toolName || !arguments_ || !(toolName in tools_map)) {
      continue;
    }

    normalized.push({
      tool_name: toolName,
      arguments: arguments_ as Record<string, unknown>,
      summary:
        typeof action.summary === "string" && action.summary.trim()
          ? action.summary.trim()
          : `${toolName}: ${JSON.stringify(arguments_)}`,
      security_risk: normalize_security_risk(action.security_risk),
    });
  }

  return normalized;
}

export async function plan_with_llm(
  tools_map: Record<string, ToolDefinition>,
  events: Event[],
  llm_config: LlmConfig,
): Promise<ActionPlan> {
  const client = new OpenAI({
    apiKey: llm_config.apiKey,
    baseURL: llm_config.baseUrl ?? undefined,
  });

  const response = await client.chat.completions.create({
    model: normalize_llm_model(llm_config.model, llm_config.baseUrl),
    messages: prepare_llm_messages(events),
    tools: Object.values(tools_map).map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
    tool_choice: "auto",
  });

  const message = response.choices[0]?.message;
  const thought = typeof message?.content === "string" ? message.content.trim() : "";
  const actions = message?.tool_calls ? actions_from_tool_calls(tools_map, message.tool_calls) : [];
  if (actions.length > 0) {
    return { thought, actions, assistantReply: "" };
  }

  const parsed = parse_structured_payload(thought);
  if (parsed) {
    const normalizedActions = normalize_actions_from_tools(tools_map, parsed.actions);
    if (normalizedActions.length > 0) {
      return {
        thought: typeof parsed.thought === "string" ? parsed.thought : thought,
        actions: normalizedActions,
        assistantReply: "",
      };
    }
    if (typeof parsed.assistant_message === "string" && parsed.assistant_message.trim()) {
      return {
        thought,
        actions: [],
        assistantReply: parsed.assistant_message.trim(),
      };
    }
  }

  return {
    thought,
    actions: [],
    assistantReply:
      thought ||
      "No tool action needed. Ask me to run commands, create text files, or manage a small task list.",
  };
}

export function get_last_user_message(events: Event[]): string | null {
  for (const event of [...events].reverse()) {
    if (event.kind !== "message" || event.source !== "user") {
      continue;
    }

    const text = get_message_text(event.payload);
    if (text) {
      return text;
    }
  }

  return null;
}
