import {
  conversationExists,
  createConversation,
  deleteConversation,
  submitConversationMessage,
} from "@openhands-rl/backend-core/conversation/application";
import { getConversationQueue } from "@openhands-rl/backend-core/infrastructure/queue";

export async function listConversationsService() {
  const { listConversations } = await import("@openhands-rl/backend-core/conversation/application");
  return listConversations();
}

export async function createConversationService() {
  return createConversation();
}

export async function deleteConversationService(conversationId: string) {
  return deleteConversation(conversationId);
}

export async function submitConversationMessageService(conversationId: string, text: string) {
  const run = await submitConversationMessage(conversationId, text);
  await getConversationQueue().add(
    run.run_id,
    { conversationId, runId: run.run_id },
    {
      jobId: run.run_id,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  return run;
}

export { conversationExists };
