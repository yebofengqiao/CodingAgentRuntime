import type { FastifyReply, FastifyRequest } from "fastify";

import { detailStatus, errorDetail } from "../../shared/http/errors";
import {
  cancelRunService,
  getRunService,
  getRunTraceService,
  rerunRunService,
  startRunService,
} from "./service";
import { presentRunAction, presentRunRead, presentTraceRead } from "./presenter";

type RunParams = { runId: string };

export async function getRunController(
  request: FastifyRequest<{ Params: RunParams }>,
  reply: FastifyReply,
) {
  try {
    return presentRunRead(await getRunService(request.params.runId));
  } catch (error) {
    return reply.code(404).send({ detail: errorDetail(error) });
  }
}

export async function startRunController(
  request: FastifyRequest<{ Params: RunParams }>,
  reply: FastifyReply,
) {
  try {
    const result = await startRunService(request.params.runId);
    return reply.code(202).send(presentRunAction(result.id, result.status, result.started));
  } catch (error) {
    const detail = errorDetail(error);
    return reply.code(detailStatus(detail)).send({ detail });
  }
}

export async function rerunRunController(
  request: FastifyRequest<{ Params: RunParams }>,
  reply: FastifyReply,
) {
  try {
    const result = await rerunRunService(request.params.runId);
    return reply.code(202).send(presentRunAction(result.id, result.status, result.started));
  } catch (error) {
    const detail = errorDetail(error);
    return reply.code(detailStatus(detail)).send({ detail });
  }
}

export async function cancelRunController(
  request: FastifyRequest<{ Params: RunParams }>,
  reply: FastifyReply,
) {
  try {
    const result = await cancelRunService(request.params.runId);
    return reply.code(202).send(presentRunAction(result.id, result.status, result.started));
  } catch (error) {
    const detail = errorDetail(error);
    return reply.code(detailStatus(detail)).send({ detail });
  }
}

export async function getRunTraceController(
  request: FastifyRequest<{ Params: RunParams }>,
  reply: FastifyReply,
) {
  try {
    return presentTraceRead(await getRunTraceService(request.params.runId));
  } catch (error) {
    return reply.code(404).send({ detail: errorDetail(error) });
  }
}
