import { AbstractEvent, LLMConvertibleEvent, type SerializedEvent, type UnknownEventKind } from "./base";
import { CondensationEvent } from "./condenser";
import { ConversationErrorEvent } from "./conversation_error";
import { ActionEvent } from "./llm_convertible/action";
import { MessageEvent } from "./llm_convertible/message";
import { AgentErrorEvent, ObservationEvent } from "./llm_convertible/observation";
import { SystemPromptEvent } from "./llm_convertible/system";
import { UserApproveEvent, UserRejectEvent } from "./user_action";
import { UnknownEvent } from "./unknown";
import type {
  ActionPayload,
  AgentErrorPayload,
  CondensationPayload,
  ConversationErrorPayload,
  EventKind,
  JsonRecord,
  MessagePayload,
  ObservationPayload,
  SystemPromptPayload,
  UserApprovePayload,
  UserRejectPayload,
} from "./types";
import type { EventMetadata } from "./internal";

export type Event =
  | SystemPromptEvent
  | MessageEvent
  | ActionEvent
  | ObservationEvent
  | AgentErrorEvent
  | ConversationErrorEvent
  | CondensationEvent
  | UserApproveEvent
  | UserRejectEvent
  | UnknownEvent;

export type Condensation = CondensationEvent;
export type UserRejectObservation = UserRejectEvent;

export function is_llm_convertible_event(event: unknown): event is LLMConvertibleEvent<EventKind, JsonRecord> {
  return event instanceof LLMConvertibleEvent;
}

export function hydrate_event(event: Event): Event;
export function hydrate_event<TPayload extends JsonRecord>(event: SerializedEvent<TPayload>): Event;
export function hydrate_event<TPayload extends JsonRecord>(
  event: Event | SerializedEvent<TPayload>,
): Event {
  if (event instanceof AbstractEvent) {
    return event;
  }
  return create_event(event.kind, event.source, event.payload, {
    id: event.id,
    timestamp: event.timestamp,
  });
}

export function hydrate_events(events: Array<Event | SerializedEvent>): Event[] {
  return events.map((event) => hydrate_event(event));
}

export function create_event(
  kind: "system_prompt",
  source: string,
  payload: SystemPromptPayload,
  metadata?: EventMetadata,
): SystemPromptEvent;
export function create_event(
  kind: "message",
  source: string,
  payload: MessagePayload | JsonRecord,
  metadata?: EventMetadata,
): MessageEvent;
export function create_event(
  kind: "action",
  source: string,
  payload: ActionPayload,
  metadata?: EventMetadata,
): ActionEvent;
export function create_event(
  kind: "observation",
  source: string,
  payload: ObservationPayload,
  metadata?: EventMetadata,
): ObservationEvent;
export function create_event(
  kind: "agent_error",
  source: string,
  payload: AgentErrorPayload,
  metadata?: EventMetadata,
): AgentErrorEvent;
export function create_event(
  kind: "conversation_error",
  source: string,
  payload: ConversationErrorPayload,
  metadata?: EventMetadata,
): ConversationErrorEvent;
export function create_event(
  kind: "condensation",
  source: string,
  payload: CondensationPayload,
  metadata?: EventMetadata,
): CondensationEvent;
export function create_event(
  kind: "user_approve",
  source: string,
  payload: UserApprovePayload,
  metadata?: EventMetadata,
): UserApproveEvent;
export function create_event(
  kind: "user_reject",
  source: string,
  payload: UserRejectPayload,
  metadata?: EventMetadata,
): UserRejectEvent;
export function create_event<TPayload extends JsonRecord>(
  kind: EventKind | string,
  source: string,
  payload: TPayload,
  metadata?: EventMetadata,
): Event;
export function create_event<TPayload extends JsonRecord>(
  kind: EventKind | string,
  source: string,
  payload: TPayload,
  metadata?: EventMetadata,
): Event {
  switch (kind) {
    case "system_prompt":
      return new SystemPromptEvent(source, payload, metadata);
    case "message":
      return new MessageEvent(source, payload, metadata);
    case "action":
      return new ActionEvent(source, payload, metadata);
    case "observation":
      return new ObservationEvent(source, payload, metadata);
    case "agent_error":
      return new AgentErrorEvent(source, payload, metadata);
    case "conversation_error":
      return new ConversationErrorEvent(source, payload, metadata);
    case "condensation":
      return new CondensationEvent(source, payload, metadata);
    case "user_approve":
      return new UserApproveEvent(source, payload, metadata);
    case "user_reject":
      return new UserRejectEvent(source, payload, metadata);
    default:
      return new UnknownEvent(kind as UnknownEventKind, source, payload, metadata);
  }
}
