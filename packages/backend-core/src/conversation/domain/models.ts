import type { JsonRecord } from "../../shared/json";

export type ConversationCreated = {
  conversation_id: string;
  execution_status: string;
  created_at: string;
  updated_at: string;
  last_event_at: string | null;
};

export type ConversationItem = ConversationCreated;

export type ConversationEventRead = {
  seq: number;
  event_id: string;
  kind: string;
  source: string;
  payload: JsonRecord;
  timestamp: string;
};

export type ConversationRunRead = {
  run_id: string;
  conversation_id: string;
  status: string;
  waiting_action_id: string | null;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationActionDecisionAccepted = {
  accepted: boolean;
  run_id: string | null;
  action_id: string;
};

export type ConversationPacket =
  | { type: "event"; data: ConversationEventRead }
  | { type: "status"; data: { execution_status: string } }
  | { type: "run"; data: ConversationRunRead }
  | { type: "error"; data: { code: string; detail: string } }
  | { type: "run_sync"; data: { execution_status: string } };

export type ConversationEventDocument = {
  conversationId: string;
  seq: number;
  eventId: string;
  kind: string;
  source: string;
  payload: Record<string, unknown>;
  timestamp: Date;
};
