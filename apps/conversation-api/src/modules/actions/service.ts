import {
  approveConversationAction,
  rejectConversationAction,
} from "@openhands-rl/backend-core/conversation/application";
import { getConversationQueue } from "@openhands-rl/backend-core/infrastructure/queue";

export async function approveConversationActionService(
  conversationId: string,
  actionId: string,
  reason?: string,
) {
  const result = await approveConversationAction(conversationId, actionId, reason);
  if (result.run_id) {
    await getConversationQueue().add(
      result.run_id,
      { conversationId, runId: result.run_id },
      {
        jobId: result.run_id,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
  return result;
}

export async function rejectConversationActionService(
  conversationId: string,
  actionId: string,
  reason?: string,
) {
  return rejectConversationAction(conversationId, actionId, reason);
}
