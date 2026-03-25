import type { FastifyReply, FastifyRequest } from "fastify";

import {
  conversationExists,
  getConversationRunService,
  listConversationRunsService,
} from "./service";
import { presentConversationRun, presentConversationRuns } from "./presenter";

type ConversationParams = { conversationId: string };
type RunParams = { conversationId: string; runId: string };

export async function listConversationRunsController(
  request: FastifyRequest<{ Params: ConversationParams; Querystring: { limit?: string } }>,
  reply: FastifyReply,
) {
  const { conversationId } = request.params;
  if (!(await conversationExists(conversationId))) {
    return reply.code(404).send({ detail: "Conversation not found" });
  }
  const limit = Number(request.query.limit ?? "100");
  return presentConversationRuns(await listConversationRunsService(conversationId, limit));
}

export async function getConversationRunController(
  request: FastifyRequest<{ Params: RunParams }>,
  reply: FastifyReply,
) {
  const { conversationId, runId } = request.params;
  if (!(await conversationExists(conversationId))) {
    return reply.code(404).send({ detail: "Conversation not found" });
  }
  const run = await getConversationRunService(conversationId, runId);
  if (!run) {
    return reply.code(404).send({ detail: `Run ${runId} not found` });
  }
  return presentConversationRun(run);
}
