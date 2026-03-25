import type {
  ConversationCreated,
  ConversationEvent,
  ConversationItem,
  ConversationRun,
} from "../model/types";

export function mergeConversationEvent(
  existing: ConversationEvent[],
  incoming: ConversationEvent,
): ConversationEvent[] {
  if (existing.some((event) => event.seq === incoming.seq)) {
    return existing;
  }

  return [...existing, incoming].sort((left, right) => left.seq - right.seq);
}

export function mergeConversationRun(
  existing: ConversationRun[],
  incoming: ConversationRun,
): ConversationRun[] {
  const next = existing.filter((run) => run.run_id !== incoming.run_id);
  next.push(incoming);
  next.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  return next;
}

export function toConversationItem(created: ConversationCreated): ConversationItem {
  return {
    conversation_id: created.conversation_id,
    execution_status: created.execution_status,
    created_at: created.created_at,
    updated_at: created.updated_at,
    last_event_at: created.last_event_at,
  };
}
