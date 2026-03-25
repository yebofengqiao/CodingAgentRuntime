import { LLMConvertibleEvent, type ChatMessage } from "../base";
import {
  cloneTextContentBlocks,
  normalizeMessageRole,
  normalizeOptionalString,
  toChatTextParts,
  type EventMetadata,
} from "../internal";
import { get_message_content_blocks, get_message_extended_content } from "../payload";
import {
  textContentBlocksToText,
  type JsonRecord,
  type MessagePayload,
  type TextContentBlock,
} from "../types";

export class MessageEvent extends LLMConvertibleEvent<"message", MessagePayload> {
  readonly role: string;
  readonly content_blocks: TextContentBlock[];
  readonly activated_skills: string[];
  readonly extended_content: TextContentBlock[];
  readonly llm_response_id: string | null;
  readonly sender: string | null;

  constructor(source: string, payload: JsonRecord, metadata?: EventMetadata) {
    super("message", source, metadata);
    this.role = normalizeMessageRole(source, payload);
    this.content_blocks = cloneTextContentBlocks(get_message_content_blocks(payload));
    this.activated_skills = Array.isArray(payload.activated_skills)
      ? payload.activated_skills.filter((item): item is string => typeof item === "string")
      : [];
    this.extended_content = cloneTextContentBlocks(get_message_extended_content(payload));
    this.llm_response_id = normalizeOptionalString(payload.llm_response_id);
    this.sender = normalizeOptionalString(payload.sender);
  }

  get text(): string {
    return textContentBlocksToText(this.content_blocks);
  }

  get payload(): MessagePayload {
    return {
      llm_message: {
        role: this.role,
        content: cloneTextContentBlocks(this.content_blocks),
      },
      activated_skills: [...this.activated_skills],
      extended_content: cloneTextContentBlocks(this.extended_content),
      ...(this.llm_response_id ? { llm_response_id: this.llm_response_id } : {}),
      ...(this.sender ? { sender: this.sender } : {}),
      role: this.role,
      ...(this.text ? { text: this.text } : {}),
    };
  }

  to_llm_message(): ChatMessage {
    const content = [...this.content_blocks, ...this.extended_content];
    const role =
      this.role === "user" || this.role === "assistant"
        ? (this.role as "user" | "assistant")
        : "assistant";

    return {
      role,
      content: content.length > 0 ? toChatTextParts(content) : "",
    };
  }
}
