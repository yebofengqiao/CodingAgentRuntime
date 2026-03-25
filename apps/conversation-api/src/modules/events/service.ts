import {
  conversationExists,
  listConversationEvents,
} from "@openhands-rl/backend-core/conversation/application";

export { conversationExists };

export async function listConversationEventsService(
  conversationId: string,
  afterSeq: number,
  limit: number,
) {
  return listConversationEvents(conversationId, afterSeq, limit);
}
