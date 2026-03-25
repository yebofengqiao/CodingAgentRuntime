import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import {
  build_system_prompt_event,
  build_user_message_event,
  create_event,
  hydrate_event,
  recover_activated_knowledge_skills,
  resolve_runtime_context,
  type Event,
} from "@openhands-rl/runtime-core/runtime";

import { settings } from "../../config/settings";
import { utcNow } from "../../shared";
import type { ConversationActionDecisionAccepted, ConversationRunRead } from "../domain/models";
import {
  conversationExists,
  createConversationRecord,
  createConversationRunRecord,
  deleteConversationRecord,
  getConversationRecord,
  getConversationRun,
  getLatestWaitingRun,
  listConversationEvents,
  listConversationRecords,
  listConversationRuns,
} from "../infrastructure/repositories";
import {
  appendConversationEventAndPublish,
  publishConversationPacket,
  setConversationRunStatus,
  setConversationStatus,
} from "../runtime/manager";

export async function createConversation() {
  return createConversationRecord();
}

export async function listConversations() {
  return listConversationRecords();
}

export { conversationExists, listConversationEvents, listConversationRuns, getConversationRun };

function toRuntimeEvent(record: {
  kind: string;
  source: string;
  payload: Record<string, unknown>;
  event_id: string;
  timestamp: string;
}): Event {
  return hydrate_event({
    kind: record.kind,
    source: record.source,
    payload: record.payload,
    id: record.event_id,
    timestamp: record.timestamp,
  });
}

export async function submitConversationMessage(
  conversationId: string,
  text: string,
): Promise<ConversationRunRead> {
  const [conversation, existingEventRows] = await Promise.all([
    getConversationRecord(conversationId),
    listConversationEvents(conversationId, 0, 10_000),
  ]);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const workspaceDir = resolve(settings.workspaceRoot, "conversations", conversationId);
  const runtime_context = resolve_runtime_context(
    {
      load_user_skills: true,
      platform_context_root: settings.platformContextRoot,
      workspace_context_root: workspaceDir,
      load_platform_context: true,
      load_workspace_context: true,
    },
    workspaceDir,
  );
  const existingEvents = existingEventRows.map(toRuntimeEvent);

  if (!existingEvents.some((event) => event.kind === "system_prompt")) {
    const systemEvent = build_system_prompt_event({
      runtime_context,
      working_dir: workspaceDir,
    });
    await appendConversationEventAndPublish(conversationId, systemEvent);
    existingEvents.push(systemEvent);
  }

  const userEvent = build_user_message_event({
    raw_text: text,
    prior_events: existingEvents,
    runtime_context,
    skip_skill_names: recover_activated_knowledge_skills(existingEvents),
  });
  await appendConversationEventAndPublish(conversationId, userEvent);

  const run = await createConversationRunRecord(conversationId);
  await publishConversationPacket(conversationId, {
    type: "run",
    data: run,
  });
  return run;
}

export async function approveConversationAction(
  conversationId: string,
  actionId: string,
  reason?: string,
): Promise<ConversationActionDecisionAccepted> {
  const waitingRun = await getLatestWaitingRun(conversationId);
  if (!waitingRun) {
    throw new Error("No run is waiting for approval");
  }
  if (waitingRun.waiting_action_id && waitingRun.waiting_action_id !== actionId) {
    throw new Error(`Action ${actionId} is not the current waiting action`);
  }

  await appendConversationEventAndPublish(
    conversationId,
    create_event(
      "user_approve",
      "user",
      {
        action_id: actionId,
        reason: reason ?? null,
      },
      {
        id: randomUUID(),
        timestamp: utcNow().toISOString(),
      },
    ),
  );
  await setConversationStatus(conversationId, "idle");
  await setConversationRunStatus(waitingRun.run_id, {
    status: "queued",
    waitingActionId: null,
    errorDetail: null,
  });
  return {
    accepted: true,
    run_id: waitingRun.run_id,
    action_id: actionId,
  };
}

export async function rejectConversationAction(
  conversationId: string,
  actionId: string,
  reason?: string,
): Promise<ConversationActionDecisionAccepted> {
  const waitingRun = await getLatestWaitingRun(conversationId);
  if (!waitingRun) {
    throw new Error("No run is waiting for approval");
  }
  if (waitingRun.waiting_action_id && waitingRun.waiting_action_id !== actionId) {
    throw new Error(`Action ${actionId} is not the current waiting action`);
  }

  await appendConversationEventAndPublish(
    conversationId,
    create_event(
      "user_reject",
      "user",
      {
        action_id: actionId,
        reason: reason ?? null,
      },
      {
        id: randomUUID(),
        timestamp: utcNow().toISOString(),
      },
    ),
  );
  await setConversationStatus(conversationId, "paused");
  await setConversationRunStatus(waitingRun.run_id, {
    status: "finished",
    waitingActionId: null,
    errorDetail: null,
  });
  return {
    accepted: true,
    run_id: waitingRun.run_id,
    action_id: actionId,
  };
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
  return deleteConversationRecord(conversationId);
}
