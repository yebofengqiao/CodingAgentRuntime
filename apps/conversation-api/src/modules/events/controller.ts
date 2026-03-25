import type { FastifyReply, FastifyRequest } from "fastify";

import { conversationExists, listConversationEventsService } from "./service";
import { presentConversationEvents } from "./presenter";

type ConversationParams = { conversationId: string };
type ConversationEventsQuery = { after_seq?: string; limit?: string };

export async function listConversationEventsController(
  request: FastifyRequest<{ Params: ConversationParams; Querystring: ConversationEventsQuery }>,
  reply: FastifyReply,
) {
  const { conversationId } = request.params;
  if (!(await conversationExists(conversationId))) {
    return reply.code(404).send({ detail: "Conversation not found" });
  }
  const afterSeq = Number(request.query.after_seq ?? "0");
  const limit = Number(request.query.limit ?? "200");
  return presentConversationEvents(
    await listConversationEventsService(conversationId, afterSeq, limit),
  );
}
