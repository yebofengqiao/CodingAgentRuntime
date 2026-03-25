import type { FastifyInstance } from "fastify";

import { getArtifactController } from "./controller";

export async function registerArtifactRoutes(app: FastifyInstance) {
  app.get("/api/v1/artifacts/:runId/:kind", getArtifactController);
}
