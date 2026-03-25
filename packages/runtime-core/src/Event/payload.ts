import {
  createTextContentBlock,
  normalizeTextContentBlocks,
  textContentBlocksToText,
  type JsonRecord,
  type TextContentBlock,
} from "./types";

export function get_system_prompt_content_blocks(payload: JsonRecord): TextContentBlock[] {
  const system_prompt = normalizeTextContentBlocks(payload.system_prompt);
  const dynamic_context = normalizeTextContentBlocks(payload.dynamic_context);
  if (system_prompt.length > 0 || dynamic_context.length > 0) {
    return [...system_prompt, ...dynamic_context];
  }

  const legacy_content_blocks = normalizeTextContentBlocks(payload.content_blocks);
  if (legacy_content_blocks.length > 0) {
    return [...legacy_content_blocks];
  }

  const legacy_base_text = typeof payload.base_text === "string" ? payload.base_text.trim() : "";
  if (legacy_base_text) {
    return [createTextContentBlock(legacy_base_text)];
  }

  const legacy_text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (legacy_text) {
    return [createTextContentBlock(legacy_text)];
  }

  return [];
}

export function get_system_prompt_text(payload: JsonRecord): string {
  return textContentBlocksToText(get_system_prompt_content_blocks(payload));
}

export function get_message_role(payload: JsonRecord): string | null {
  if (payload.llm_message && typeof payload.llm_message === "object") {
    const role = (payload.llm_message as { role?: unknown }).role;
    if (typeof role === "string" && role.trim()) {
      return role.trim();
    }
  }

  const legacy_role = typeof payload.role === "string" ? payload.role.trim() : "";
  return legacy_role || null;
}

export function get_message_content_blocks(payload: JsonRecord): TextContentBlock[] {
  if (payload.llm_message && typeof payload.llm_message === "object") {
    const content = normalizeTextContentBlocks((payload.llm_message as { content?: unknown }).content);
    if (content.length > 0) {
      return content;
    }
  }

  const legacy_raw_text = typeof payload.raw_text === "string" ? payload.raw_text.trim() : "";
  if (legacy_raw_text) {
    return [createTextContentBlock(legacy_raw_text)];
  }

  const legacy_text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (legacy_text) {
    return [createTextContentBlock(legacy_text)];
  }

  return [];
}

export function get_message_extended_content(payload: JsonRecord): TextContentBlock[] {
  return normalizeTextContentBlocks(payload.extended_content);
}

export function get_message_text(
  payload: JsonRecord,
  options?: { include_extended_content?: boolean },
): string {
  const include_extended_content = options?.include_extended_content ?? true;
  const blocks = [
    ...get_message_content_blocks(payload),
    ...(include_extended_content ? get_message_extended_content(payload) : []),
  ];
  return textContentBlocksToText(blocks);
}
