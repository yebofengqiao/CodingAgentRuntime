import type { FastifyReply, FastifyRequest } from "fastify";

import { detailStatus, errorDetail } from "../../shared/http/errors";
import {
  approveConversationActionService,
  rejectConversationActionService,
} from "./service";
import { presentActionDecision } from "./presenter";

type ActionParams = { conversationId: string; actionId: string };

export async function approveConversationActionController(
  request: FastifyRequest<{ Params: ActionParams; Body: { reason?: string } }>,
  reply: FastifyReply,
) {
  const { conversationId, actionId } = request.params;
  try {
    return reply
      .code(202)
      .send(
        presentActionDecision(
          await approveConversationActionService(conversationId, actionId, request.body?.reason),
        ),
      );
  } catch (error) {
    const detail = errorDetail(error);
    return reply.code(detailStatus(detail)).send({ detail });
  }
}

export async function rejectConversationActionController(
  request: FastifyRequest<{ Params: ActionParams; Body: { reason?: string } }>,
  reply: FastifyReply,
) {
  const { conversationId, actionId } = request.params;
  try {
    return reply
      .code(202)
      .send(
        presentActionDecision(
          await rejectConversationActionService(conversationId, actionId, request.body?.reason),
        ),
      );
  } catch (error) {
    const detail = errorDetail(error);
    return reply.code(detailStatus(detail)).send({ detail });
  }
}
