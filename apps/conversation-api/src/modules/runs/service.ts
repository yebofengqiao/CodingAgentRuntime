import {
  conversationExists,
  getConversationRun,
  listConversationRuns,
} from "@openhands-rl/backend-core/conversation/application";

export { conversationExists };

export async function listConversationRunsService(conversationId: string, limit: number) {
  return listConversationRuns(conversationId, limit);
}

export async function getConversationRunService(conversationId: string, runId: string) {
  return getConversationRun(conversationId, runId);
}
