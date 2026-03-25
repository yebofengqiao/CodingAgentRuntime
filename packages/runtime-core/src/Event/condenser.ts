import { AbstractEvent } from "./base";
import {
  normalizeString,
  normalizeStringArray,
  type EventMetadata,
} from "./internal";
import type { CondensationPayload, JsonRecord } from "./types";

export class CondensationEvent extends AbstractEvent<"condensation", CondensationPayload> {
  readonly reason: string;
  readonly forgotten_event_ids: string[];
  readonly summary: string;
  readonly summary_offset: number;

  constructor(source: string, payload: JsonRecord, metadata?: EventMetadata) {
    super("condensation", source, metadata);
    this.reason = normalizeString(payload.reason);
    this.forgotten_event_ids = normalizeStringArray(payload.forgotten_event_ids);
    this.summary = normalizeString(payload.summary);
    this.summary_offset =
      typeof payload.summary_offset === "number" ? payload.summary_offset : 0;
  }

  get payload(): CondensationPayload {
    return {
      reason: this.reason,
      forgotten_event_ids: [...this.forgotten_event_ids],
      summary: this.summary,
      summary_offset: this.summary_offset,
    };
  }
}
