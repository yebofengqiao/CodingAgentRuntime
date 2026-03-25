import { LLMConvertibleEvent, type ChatMessage } from "../base";
import {
  normalizeOptionalString,
  normalizeString,
  type EventMetadata,
} from "../internal";
import type {
  AgentErrorPayload,
  JsonRecord,
  ObservationPayload,
} from "../types";

export class ObservationEvent extends LLMConvertibleEvent<"observation", ObservationPayload> {
  readonly action_id: string;
  readonly tool_name: string;
  readonly result: string;

  constructor(source: string, payload: JsonRecord, metadata?: EventMetadata) {
    super("observation", source, metadata);
    this.action_id = normalizeString(payload.action_id);
    this.tool_name = normalizeString(payload.tool_name);
    this.result = normalizeString(payload.result);
  }

  get payload(): ObservationPayload {
    return {
      action_id: this.action_id,
      tool_name: this.tool_name,
      result: this.result,
    };
  }

  to_llm_message(): ChatMessage {
    return {
      role: "tool",
      tool_call_id: this.action_id,
      content: this.result,
    };
  }
}

export class AgentErrorEvent extends LLMConvertibleEvent<"agent_error", AgentErrorPayload> {
  readonly action_id?: string;
  readonly tool_name: string;
  readonly error: string;

  constructor(source: string, payload: JsonRecord, metadata?: EventMetadata) {
    super("agent_error", source, metadata);
    this.action_id = normalizeOptionalString(payload.action_id) ?? undefined;
    this.tool_name = normalizeString(payload.tool_name);
    this.error = normalizeString(payload.error);
  }

  get payload(): AgentErrorPayload {
    return {
      tool_name: this.tool_name,
      error: this.error,
      ...(this.action_id ? { action_id: this.action_id } : {}),
    };
  }

  to_llm_message(): ChatMessage {
    return {
      role: "tool",
      tool_call_id: this.action_id ?? this.id,
      content: this.error,
    };
  }
}
