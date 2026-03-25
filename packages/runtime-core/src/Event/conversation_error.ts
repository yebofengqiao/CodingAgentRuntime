import { AbstractEvent } from "./base";
import {
  normalizeOptionalString,
  normalizeString,
  type EventMetadata,
} from "./internal";
import type {
  ConversationErrorPayload,
  JsonRecord,
} from "./types";

export class ConversationErrorEvent extends AbstractEvent<
  "conversation_error",
  ConversationErrorPayload
> {
  readonly code: string;
  readonly detail?: string;

  constructor(source: string, payload: JsonRecord, metadata?: EventMetadata) {
    super("conversation_error", source, metadata);
    this.code = normalizeString(payload.code);
    this.detail = normalizeOptionalString(payload.detail) ?? undefined;
  }

  get payload(): ConversationErrorPayload {
    return {
      code: this.code,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }
}
