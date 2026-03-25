import { AbstractEvent } from "./base";
import {
  normalizeOptionalString,
  normalizeString,
  type EventMetadata,
} from "./internal";
import type {
  JsonRecord,
  UserApprovePayload,
  UserRejectPayload,
} from "./types";

export class UserApproveEvent extends AbstractEvent<"user_approve", UserApprovePayload> {
  readonly action_id: string;
  readonly reason?: string | null;

  constructor(source: string, payload: JsonRecord, metadata?: EventMetadata) {
    super("user_approve", source, metadata);
    this.action_id = normalizeString(payload.action_id);
    this.reason =
      payload.reason == null ? null : normalizeOptionalString(payload.reason);
  }

  get payload(): UserApprovePayload {
    return {
      action_id: this.action_id,
      ...(this.reason !== undefined ? { reason: this.reason } : {}),
    };
  }
}

export class UserRejectEvent extends AbstractEvent<"user_reject", UserRejectPayload> {
  readonly action_id: string;
  readonly reason?: string | null;

  constructor(source: string, payload: JsonRecord, metadata?: EventMetadata) {
    super("user_reject", source, metadata);
    this.action_id = normalizeString(payload.action_id);
    this.reason =
      payload.reason == null ? null : normalizeOptionalString(payload.reason);
  }

  get payload(): UserRejectPayload {
    return {
      action_id: this.action_id,
      ...(this.reason !== undefined ? { reason: this.reason } : {}),
    };
  }
}
