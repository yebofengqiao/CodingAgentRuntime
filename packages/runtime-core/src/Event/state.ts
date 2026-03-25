import { randomUUID } from "node:crypto";

import type { ActionEvent } from "./llm_convertible/action";
import type { Event } from "./factory";
import type { ConversationExecutionStatus } from "./types";

export interface ConversationState {
  id: string;
  execution_status: ConversationExecutionStatus;
  events: Event[];
  max_iterations: number;
  activated_knowledge_skills: string[];
}

function build_initial_conversation_state(max_iterations = 50): ConversationState {
  return {
    id: randomUUID(),
    execution_status: "idle",
    events: [],
    max_iterations,
    activated_knowledge_skills: [],
  };
}

export const ConversationState = {
  create(max_iterations = 50): ConversationState {
    return build_initial_conversation_state(max_iterations);
  },
  get_unmatched_actions(events: Event[]): ActionEvent[] {
    return get_unmatched_actions(events);
  },
  get_pending_approval_actions(events: Event[]): ActionEvent[] {
    return get_pending_approval_actions(events);
  },
};

export function get_unmatched_actions(events: Event[]): ActionEvent[] {
  const resolvedActionIds = new Set<string>();
  const approvedActionIds = new Set<string>();
  const unmatched: ActionEvent[] = [];

  for (const event of [...events].reverse()) {
    if (event.kind === "observation" || event.kind === "agent_error" || event.kind === "user_reject") {
      const actionId = typeof event.payload.action_id === "string" ? event.payload.action_id : null;
      if (actionId) {
        resolvedActionIds.add(actionId);
      }
      continue;
    }

    if (event.kind === "user_approve") {
      const actionId = typeof event.payload.action_id === "string" ? event.payload.action_id : null;
      if (actionId) {
        approvedActionIds.add(actionId);
      }
      continue;
    }

    if (event.kind !== "action") {
      continue;
    }

    const executable = Boolean(event.payload.executable ?? true);
    const requiresConfirmation = Boolean(event.payload.requires_confirmation ?? false);
    const approved = approvedActionIds.has(event.id);
    if (!resolvedActionIds.has(event.id) && (executable || (requiresConfirmation && approved))) {
      unmatched.unshift(event as ActionEvent);
    }
  }

  return unmatched;
}

export function get_pending_approval_actions(events: Event[]): ActionEvent[] {
  const resolvedActionIds = new Set<string>();
  const pending: ActionEvent[] = [];

  for (const event of [...events].reverse()) {
    if (
      event.kind === "observation" ||
      event.kind === "agent_error" ||
      event.kind === "user_reject" ||
      event.kind === "user_approve"
    ) {
      const actionId = typeof event.payload.action_id === "string" ? event.payload.action_id : null;
      if (actionId) {
        resolvedActionIds.add(actionId);
      }
      continue;
    }

    if (event.kind !== "action") {
      continue;
    }

    const executable = Boolean(event.payload.executable ?? true);
    const requiresConfirmation = Boolean(event.payload.requires_confirmation ?? false);
    if (!executable && requiresConfirmation && !resolvedActionIds.has(event.id)) {
      pending.unshift(event as ActionEvent);
    }
  }

  return pending;
}
