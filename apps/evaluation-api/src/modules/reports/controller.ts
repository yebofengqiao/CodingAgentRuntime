import type { FastifyReply, FastifyRequest } from "fastify";

import { loadBinaryFile } from "../../shared/http/files";
import { errorDetail } from "../../shared/http/errors";
import { presentReportNotFound } from "./presenter";
import { getReportPathService } from "./service";

type ReportParams = { experimentId: string; kind: string };

export async function getReportController(
  request: FastifyRequest<{ Params: ReportParams }>,
  reply: FastifyReply,
) {
  const { experimentId, kind } = request.params;
  try {
    const reportPath = await getReportPathService(experimentId, kind);
    if (!reportPath) {
      return reply.code(404).send(presentReportNotFound(kind));
    }
    reply.header("Content-Type", "application/octet-stream");
    return reply.send(loadBinaryFile(reportPath));
  } catch (error) {
    return reply.code(404).send({ detail: errorDetail(error) });
  }
}
