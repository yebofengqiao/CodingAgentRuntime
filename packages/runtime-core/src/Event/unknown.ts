import { AbstractEvent, type UnknownEventKind } from "./base";
import {
  normalizeRecord,
  type EventMetadata,
} from "./internal";
import type { JsonRecord } from "./types";

export class UnknownEvent extends AbstractEvent<UnknownEventKind, JsonRecord> {
  readonly raw_payload: JsonRecord;

  constructor(kind: UnknownEventKind, source: string, payload: JsonRecord, metadata?: EventMetadata) {
    super(kind, source, metadata);
    this.raw_payload = normalizeRecord(payload);
  }

  get payload(): JsonRecord {
    return { ...this.raw_payload };
  }
}
