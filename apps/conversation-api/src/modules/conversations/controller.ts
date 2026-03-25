import type { FastifyReply, FastifyRequest } from "fastify";

import { settings } from "@openhands-rl/backend-core/config";

import { detailStatus, errorDetail } from "../../shared/http/errors";
import {
  conversationExists,
  createConversationService,
  deleteConversationService,
  listConversationsService,
  submitConversationMessageService,
} from "./service";
import {
  presentConversationAccepted,
  presentConversationCreated,
  presentConversationList,
} from "./presenter";

type ConversationParams = { conversationId: string };

export async function listConversationsController() {
  return presentConversationList(await listConversationsService());
}

export async function createConversationController(_request: FastifyRequest, reply: FastifyReply) {
  const created = await createConversationService();
  return reply.code(201).send(presentConversationCreated(created));
}

export async function deleteConversationController(
  request: FastifyRequest<{ Params: ConversationParams }>,
  reply: FastifyReply,
) {
  const deleted = await deleteConversationService(request.params.conversationId);
  if (!deleted) {
    return reply.code(404).send({ detail: "Conversation not found" });
  }
  return reply.code(204).send();
}

export async function submitConversationMessageController(
  request: FastifyRequest<{ Params: ConversationParams; Body: { text?: string } }>,
  reply: FastifyReply,
) {
  const { conversationId } = request.params;
  const text = request.body?.text?.trim() ?? "";
  if (!text) {
    return reply.code(422).send({ detail: "text must not be empty" });
  }
  if (!(await conversationExists(conversationId))) {
    return reply.code(404).send({ detail: "Conversation not found" });
  }
  if (!settings.llmApiKey) {
    return reply.code(503).send({
      detail: {
        code: "LLMApiKeyMissing",
        detail: "LLM_API_KEY environment variable is required.",
      },
    });
  }
  try {
    const run = await submitConversationMessageService(conversationId, text);
    return reply.code(202).send(presentConversationAccepted(run.run_id));
  } catch (error) {
    const detail = errorDetail(error);
    return reply.code(detailStatus(detail, 404, 500)).send({ detail });
  }
}
