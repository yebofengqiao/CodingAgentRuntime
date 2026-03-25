import { settings } from "@openhands-rl/backend-core/config";
import {
  getConversationRecord,
  getConversationRunRecord,
  listConversationEvents,
} from "@openhands-rl/backend-core/conversation/infrastructure";
import {
  appendConversationEventAndPublish,
  setConversationRunStatus,
  setConversationStatus,
} from "@openhands-rl/backend-core/conversation/runtime";
import {
  Conversation,
  ConversationState,
  get_pending_approval_actions,
  hydrate_events,
} from "@openhands-rl/runtime-core/runtime";

import { llmConfigFromSettings } from "../../shared/llm";
import type { ConversationJob } from "../../shared/types";

export async function processConversationRun(job: ConversationJob): Promise<void> {
  const [conversation, run, persistedEvents] = await Promise.all([
    getConversationRecord(job.conversationId),
    getConversationRunRecord(job.runId),
    listConversationEvents(job.conversationId, 0, 10_000),
  ]);

  if (!conversation || !run) {
    return;
  }

  await setConversationStatus(job.conversationId, "running");
  await setConversationRunStatus(job.runId, {
    status: "running",
    waitingActionId: null,
    errorDetail: null,
  });

  const state = ConversationState.create(50);
  state.id = job.conversationId;
  state.execution_status =
    (conversation.executionStatus as typeof state.execution_status) ?? "idle";
  state.events = hydrate_events(
    persistedEvents.map((item) => ({
      kind: item.kind,
      source: item.source,
      payload: item.payload,
      id: item.event_id,
      timestamp: item.timestamp,
    })),
  );

  const workspace_dir = `${settings.workspaceRoot}/conversations/${job.conversationId}`;
  const runtime_context = {
    load_user_skills: true,
    platform_context_root: settings.platformContextRoot,
    workspace_context_root: workspace_dir,
    load_platform_context: true,
    load_workspace_context: true,
  };

  try {
    const result = await Conversation.run({
      state,
      workspace_dir,
      llm_config: llmConfigFromSettings(),
      runtime_context,
      on_event: async (event) => {
        await appendConversationEventAndPublish(job.conversationId, event);
      },
    });

    await setConversationStatus(job.conversationId, result.execution_status);

    if (result.execution_status === "waiting_for_confirmation") {
      const pendingActions = get_pending_approval_actions(state.events);
      const latest = pendingActions[pendingActions.length - 1];
      await setConversationRunStatus(job.runId, {
        status: "waiting_approval",
        waitingActionId: latest?.id ?? null,
        errorDetail: null,
      });
      return;
    }

    if (result.execution_status === "error") {
      await setConversationRunStatus(job.runId, {
        status: "error",
        waitingActionId: null,
        errorDetail: "Conversation runtime ended in error status.",
      });
      return;
    }

    await setConversationRunStatus(job.runId, {
      status: "finished",
      waitingActionId: null,
      errorDetail: null,
    });
  } catch (error) {
    await setConversationStatus(job.conversationId, "error");
    await setConversationRunStatus(job.runId, {
      status: "error",
      waitingActionId: null,
      errorDetail: error instanceof Error ? error.message : String(error),
    });
  }
}
