import type { FastifyReply, FastifyRequest } from "fastify";
import { basename, extname } from "node:path";

import { loadBinaryFile } from "../../shared/http/files";
import { errorDetail } from "../../shared/http/errors";
import { presentArtifactNotFound } from "./presenter";
import { getArtifactPathService } from "./service";

type ArtifactParams = { runId: string; kind: string };

function resolveArtifactContentType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }
  if (extension === ".jsonl") {
    return "application/x-ndjson; charset=utf-8";
  }
  if (extension === ".patch" || extension === ".diff") {
    return "text/x-diff; charset=utf-8";
  }
  if (extension === ".md") {
    return "text/markdown; charset=utf-8";
  }
  if (extension === ".txt") {
    return "text/plain; charset=utf-8";
  }
  if (extension === ".csv") {
    return "text/csv; charset=utf-8";
  }
  return "application/octet-stream";
}

export async function getArtifactController(
  request: FastifyRequest<{ Params: ArtifactParams }>,
  reply: FastifyReply,
) {
  const { runId, kind } = request.params;
  try {
    const artifactPath = await getArtifactPathService(runId, kind);
    if (!artifactPath) {
      return reply.code(404).send(presentArtifactNotFound(kind));
    }
    reply.header("Content-Type", resolveArtifactContentType(artifactPath));
    reply.header("Content-Disposition", `inline; filename="${basename(artifactPath)}"`);
    return reply.send(loadBinaryFile(artifactPath));
  } catch (error) {
    return reply.code(404).send({ detail: errorDetail(error) });
  }
}
