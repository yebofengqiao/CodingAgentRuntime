import type { FastifyReply, FastifyRequest } from "fastify";

import { detailStatus, errorDetail } from "../../shared/http/errors";
import {
  createExperimentService,
  getExperimentService,
  listExperimentsService,
  startExperimentService,
  type CreateExperimentRequest,
} from "./service";
import {
  presentExperimentList,
  presentExperimentRead,
  presentExperimentStart,
} from "./presenter";

type ExperimentParams = { experimentId: string };

export async function listExperimentsController() {
  return presentExperimentList(await listExperimentsService());
}

export async function createExperimentController(
  request: FastifyRequest<{ Body: CreateExperimentRequest }>,
  reply: FastifyReply,
) {
  try {
    const created = await createExperimentService(request.body);
    return reply.code(201).send(created);
  } catch (error) {
    return reply.code(422).send({ detail: errorDetail(error) });
  }
}

export async function getExperimentController(
  request: FastifyRequest<{ Params: ExperimentParams }>,
  reply: FastifyReply,
) {
  try {
    return presentExperimentRead(await getExperimentService(request.params.experimentId));
  } catch (error) {
    return reply.code(404).send({ detail: errorDetail(error) });
  }
}

export async function startExperimentController(
  request: FastifyRequest<{ Params: ExperimentParams }>,
  reply: FastifyReply,
) {
  try {
    const result = await startExperimentService(request.params.experimentId);
    return reply.code(202).send(presentExperimentStart(result.id, result.started));
  } catch (error) {
    const detail = errorDetail(error);
    return reply.code(detailStatus(detail)).send({ detail });
  }
}
