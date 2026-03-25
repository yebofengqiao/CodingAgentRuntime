import type { ToolDefinition } from "../../Tool/tool";
import { LLMConvertibleEvent, type ChatMessage } from "../base";
import {
  cloneTextContentBlock,
  normalizeOptionalString,
  normalizeSystemPromptParts,
  toChatTextParts,
  type EventMetadata,
} from "../internal";
import {
  createTextContentBlock,
  type JsonRecord,
  type SystemPromptPayload,
  type TextContentBlock,
} from "../types";

export class SystemPromptEvent extends LLMConvertibleEvent<"system_prompt", SystemPromptPayload> {
  readonly system_prompt: TextContentBlock | null;
  readonly dynamic_context: TextContentBlock | null;
  readonly tools: ToolDefinition[];
  readonly context_root?: string;
  readonly platform_context_root?: string | null;
  readonly workspace_context_root?: string;
  readonly working_dir?: string;

  constructor(source: string, payload: JsonRecord, metadata?: EventMetadata) {
    super("system_prompt", source, metadata);
    const normalized = normalizeSystemPromptParts(payload);
    this.system_prompt = normalized.system_prompt ? cloneTextContentBlock(normalized.system_prompt) : null;
    this.dynamic_context = normalized.dynamic_context
      ? cloneTextContentBlock(normalized.dynamic_context)
      : null;
    this.tools = Array.isArray(payload.tools) ? [...(payload.tools as ToolDefinition[])] : [];
    this.context_root = normalizeOptionalString(payload.context_root) ?? undefined;
    this.platform_context_root =
      payload.platform_context_root == null
        ? null
        : normalizeOptionalString(payload.platform_context_root);
    this.workspace_context_root = normalizeOptionalString(payload.workspace_context_root) ?? undefined;
    this.working_dir = normalizeOptionalString(payload.working_dir) ?? undefined;
  }

  get content_blocks(): TextContentBlock[] {
    return [
      ...(this.system_prompt && this.system_prompt.text.trim()
        ? [cloneTextContentBlock(this.system_prompt)]
        : []),
      ...(this.dynamic_context && this.dynamic_context.text.trim()
        ? [cloneTextContentBlock(this.dynamic_context)]
        : []),
    ];
  }

  get payload(): SystemPromptPayload {
    return {
      system_prompt: this.system_prompt
        ? cloneTextContentBlock(this.system_prompt)
        : createTextContentBlock(""),
      dynamic_context: this.dynamic_context ? cloneTextContentBlock(this.dynamic_context) : null,
      tools: [...this.tools],
      ...(this.context_root ? { context_root: this.context_root } : {}),
      ...(this.platform_context_root !== undefined
        ? { platform_context_root: this.platform_context_root }
        : {}),
      ...(this.workspace_context_root ? { workspace_context_root: this.workspace_context_root } : {}),
      ...(this.working_dir ? { working_dir: this.working_dir } : {}),
    };
  }

  to_llm_message(): ChatMessage {
    return {
      role: "system",
      content: this.content_blocks.length > 0 ? toChatTextParts(this.content_blocks) : "",
    };
  }
}
