export type ExecutionStatus =
  | "idle"
  | "running"
  | "paused"
  | "waiting_for_confirmation"
  | "finished"
  | "error"
  | "stuck";

export interface ConversationCreated {
  conversation_id: string;
  execution_status: ExecutionStatus | string;
  created_at: string;
  updated_at: string;
  last_event_at: string | null;
}

export interface ConversationItem {
  conversation_id: string;
  execution_status: ExecutionStatus | string;
  created_at: string;
  updated_at: string;
  last_event_at: string | null;
}

export interface ConversationEvent {
  seq: number;
  event_id: string;
  kind: string;
  source: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface PostConversationMessagePayload {
  text: string;
}

export interface PostConversationMessageResponse {
  accepted: boolean;
  run_id: string;
}

export type RunStatus = "queued" | "running" | "waiting_approval" | "finished" | "error";

export interface ConversationRun {
  run_id: string;
  conversation_id: string;
  status: RunStatus | string;
  waiting_action_id: string | null;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionDecisionPayload {
  reason?: string;
}

export interface ActionDecisionResponse {
  accepted: boolean;
  run_id: string | null;
  action_id: string;
}

export interface ConversationEventPacket {
  type: "event";
  data: ConversationEvent;
}

export interface ConversationStatusPacket {
  type: "status";
  data: {
    execution_status: ExecutionStatus | string;
  };
}

export interface ConversationErrorPacket {
  type: "error";
  data: {
    code: string;
    detail: string;
  };
}

export interface ConversationRunPacket {
  type: "run";
  data: ConversationRun;
}

export interface ConversationRunSyncPacket {
  type: "run_sync";
  data: {
    execution_status: ExecutionStatus | string;
  };
}

export type ConversationPacket =
  | ConversationEventPacket
  | ConversationStatusPacket
  | ConversationErrorPacket
  | ConversationRunPacket
  | ConversationRunSyncPacket;
