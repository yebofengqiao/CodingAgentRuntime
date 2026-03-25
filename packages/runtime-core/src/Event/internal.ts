import { randomUUID } from "node:crypto";

import OpenAI from "openai";

import { get_message_role } from "./payload";
import {
  createTextContentBlock,
  normalizeTextContentBlocks,
  textContentBlocksToText,
  type JsonRecord,
  type TextContentBlock,
} from "./types";

export type EventMetadata = {
  id?: string;
  timestamp?: string;
};

export function resolveEventMetadata(metadata?: EventMetadata): {
  id: string;
  timestamp: string;
} {
  return {
    id: metadata?.id ?? randomUUID(),
    timestamp: metadata?.timestamp ?? new Date().toISOString(),
  };
}

export function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return { ...(value as JsonRecord) };
}

export function cloneTextContentBlock(block: TextContentBlock): TextContentBlock {
  return createTextContentBlock(block.text, {
    cache_prompt: typeof block.cache_prompt === "boolean" ? block.cache_prompt : null,
  });
}

export function cloneTextContentBlocks(blocks: TextContentBlock[]): TextContentBlock[] {
  return blocks.map(cloneTextContentBlock);
}

export function toChatTextParts(
  blocks: TextContentBlock[],
): OpenAI.Chat.ChatCompletionContentPartText[] {
  return blocks.map((block) => ({
    type: "text",
    text: block.text,
  }));
}

export function normalizeMessageRole(source: string, payload: JsonRecord): string {
  const role = get_message_role(payload);
  if (role) {
    return role;
  }
  if (source === "user") {
    return "user";
  }
  return "assistant";
}

export function normalizeSystemPromptParts(payload: JsonRecord): {
  system_prompt: TextContentBlock | null;
  dynamic_context: TextContentBlock | null;
} {
  const systemPromptBlocks = normalizeTextContentBlocks(payload.system_prompt);
  const dynamicContextBlocks = normalizeTextContentBlocks(payload.dynamic_context);

  if (systemPromptBlocks.length > 0 || dynamicContextBlocks.length > 0) {
    const [system_prompt, ...extraPromptBlocks] = systemPromptBlocks;
    const dynamic_context_text = textContentBlocksToText([
      ...extraPromptBlocks,
      ...dynamicContextBlocks,
    ]);
    return {
      system_prompt: system_prompt ?? null,
      dynamic_context: dynamic_context_text ? createTextContentBlock(dynamic_context_text) : null,
    };
  }

  const legacyBlocks = normalizeTextContentBlocks(payload.content_blocks);
  if (legacyBlocks.length > 0) {
    const [system_prompt, ...dynamicBlocks] = legacyBlocks;
    const dynamic_context_text = textContentBlocksToText(dynamicBlocks);
    return {
      system_prompt: system_prompt ?? null,
      dynamic_context: dynamic_context_text ? createTextContentBlock(dynamic_context_text) : null,
    };
  }

  const legacyBaseText = normalizeString(payload.base_text);
  if (legacyBaseText) {
    return {
      system_prompt: createTextContentBlock(legacyBaseText),
      dynamic_context: null,
    };
  }

  const legacyText = normalizeString(payload.text);
  if (legacyText) {
    return {
      system_prompt: createTextContentBlock(legacyText),
      dynamic_context: null,
    };
  }

  return {
    system_prompt: null,
    dynamic_context: null,
  };
}
