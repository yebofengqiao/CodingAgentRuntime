import OpenAI from "openai";

import { resolveEventMetadata, type EventMetadata } from "./internal";
import type { EventKind, JsonRecord } from "./types";

export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export type SerializedEvent<TPayload extends JsonRecord = JsonRecord> = {
  kind: EventKind | string;
  source: string;
  payload: TPayload;
  id: string;
  timestamp: string;
};

export type UnknownEventKind = string & {
  readonly __unknownEventKind: unique symbol;
};

export abstract class AbstractEvent<
  TKind extends EventKind | UnknownEventKind | string = EventKind | UnknownEventKind | string,
  TPayload extends JsonRecord = JsonRecord,
> {
  readonly kind: TKind;
  readonly source: string;
  readonly id: string;
  readonly timestamp: string;

  protected constructor(kind: TKind, source: string, metadata?: EventMetadata) {
    const resolved = resolveEventMetadata(metadata);
    this.kind = kind;
    this.source = source;
    this.id = resolved.id;
    this.timestamp = resolved.timestamp;
  }

  abstract get payload(): TPayload;

  toJSON(): SerializedEvent<TPayload> {
    return {
      kind: this.kind,
      source: this.source,
      payload: this.payload,
      id: this.id,
      timestamp: this.timestamp,
    };
  }
}

export abstract class LLMConvertibleEvent<
  TKind extends EventKind,
  TPayload extends JsonRecord,
> extends AbstractEvent<TKind, TPayload> {
  abstract to_llm_message(): ChatMessage;
}
