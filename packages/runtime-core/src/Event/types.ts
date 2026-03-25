import type { ToolDefinition } from "../Tool/tool";

export type ConversationExecutionStatus =
  | "idle"
  | "running"
  | "paused"
  | "waiting_for_confirmation"
  | "finished"
  | "error"
  | "stuck";

export type EventKind =
  | "system_prompt"
  | "message"
  | "action"
  | "observation"
  | "condensation"
  | "agent_error"
  | "conversation_error"
  | "user_approve"
  | "user_reject";

export type JsonRecord = Record<string, unknown>;

export type TextContentBlock = JsonRecord & {
  type: "text";
  text: string;
  cache_prompt?: boolean;
};

export type LlmMessagePayload = JsonRecord & {
  role: string;
  content: TextContentBlock[];
};

export type SystemPromptPayload = JsonRecord & {
  system_prompt: TextContentBlock;
  dynamic_context?: TextContentBlock | null;
  tools: ToolDefinition[];
  context_root?: string;
  platform_context_root?: string | null;
  workspace_context_root?: string;
  working_dir?: string;
};

export type MessagePayload = JsonRecord & {
  llm_message: LlmMessagePayload;
  activated_skills?: string[];
  extended_content?: TextContentBlock[];
  llm_response_id?: string | null;
  sender?: string | null;
  role?: string;
  text?: string;
};

export type ActionPayload = JsonRecord & {
  tool_name: string;
  arguments: Record<string, unknown>;
  summary: string;
  security_risk?: string;
  thought?: string;
  requires_confirmation?: boolean;
  executable?: boolean;
};

export type ObservationPayload = JsonRecord & {
  action_id: string;
  tool_name: string;
  result: string;
};

export type AgentErrorPayload = JsonRecord & {
  action_id?: string;
  tool_name: string;
  error: string;
};

export type ConversationErrorPayload = JsonRecord & {
  code: string;
  detail?: string;
};

export type CondensationPayload = JsonRecord & {
  reason: string;
  forgotten_event_ids: string[];
  summary: string;
  summary_offset: number;
};

export type UserApprovePayload = JsonRecord & {
  action_id: string;
  reason?: string | null;
};

export type UserRejectPayload = JsonRecord & {
  action_id: string;
  reason?: string | null;
};

export function createTextContentBlock(
  text: string,
  options?: { cache_prompt?: boolean | null },
): TextContentBlock {
  const block: TextContentBlock = {
    type: "text",
    text,
  };
  if (typeof options?.cache_prompt === "boolean") {
    block.cache_prompt = options.cache_prompt;
  }
  return block;
}

export function isTextContentBlock(value: unknown): value is TextContentBlock {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === "text" &&
      typeof (value as { text?: unknown }).text === "string",
  );
}

export function normalizeTextContentBlocks(value: unknown): TextContentBlock[] {
  if (typeof value === "string") {
    return value ? [createTextContentBlock(value)] : [];
  }

  if (isTextContentBlock(value)) {
    return [
      createTextContentBlock(value.text, {
        cache_prompt: typeof value.cache_prompt === "boolean" ? value.cache_prompt : null,
      }),
    ];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const blocks: TextContentBlock[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      if (item) {
        blocks.push(createTextContentBlock(item));
      }
      continue;
    }

    if (!isTextContentBlock(item)) {
      continue;
    }

    blocks.push(
      createTextContentBlock(item.text, {
        cache_prompt: typeof item.cache_prompt === "boolean" ? item.cache_prompt : null,
      }),
    );
  }

  return blocks;
}

export function textContentBlocksToText(blocks: TextContentBlock[]): string {
  return blocks
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
