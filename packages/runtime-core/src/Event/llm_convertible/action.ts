import { LLMConvertibleEvent, type ChatMessage } from "../base";
import {
  normalizeOptionalString,
  normalizeRecord,
  normalizeString,
  type EventMetadata,
} from "../internal";
import type { ActionPayload, JsonRecord } from "../types";

export class ActionEvent extends LLMConvertibleEvent<"action", ActionPayload> {
  readonly tool_name: string;
  readonly arguments: Record<string, unknown>;
  readonly summary: string;
  readonly security_risk?: string;
  readonly thought?: string;
  readonly requires_confirmation?: boolean;
  readonly executable?: boolean;

  constructor(source: string, payload: JsonRecord, metadata?: EventMetadata) {
    super("action", source, metadata);
    this.tool_name = normalizeString(payload.tool_name);
    this.arguments = normalizeRecord(payload.arguments);
    this.summary = normalizeString(payload.summary);
    this.security_risk = normalizeOptionalString(payload.security_risk) ?? undefined;
    this.thought = normalizeOptionalString(payload.thought) ?? undefined;
    this.requires_confirmation =
      typeof payload.requires_confirmation === "boolean"
        ? payload.requires_confirmation
        : undefined;
    this.executable = typeof payload.executable === "boolean" ? payload.executable : undefined;
  }

  get payload(): ActionPayload {
    return {
      tool_name: this.tool_name,
      arguments: { ...this.arguments },
      summary: this.summary,
      ...(this.security_risk ? { security_risk: this.security_risk } : {}),
      ...(this.thought ? { thought: this.thought } : {}),
      ...(typeof this.requires_confirmation === "boolean"
        ? { requires_confirmation: this.requires_confirmation }
        : {}),
      ...(typeof this.executable === "boolean" ? { executable: this.executable } : {}),
    };
  }

  to_llm_message(): ChatMessage {
    return {
      role: "assistant",
      content: this.thought ?? null,
      tool_calls: [
        {
          id: this.id,
          type: "function",
          function: {
            name: this.tool_name,
            arguments: JSON.stringify(this.arguments),
          },
        },
      ],
    };
  }
}
