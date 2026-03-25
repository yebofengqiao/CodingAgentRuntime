import type { FastifyInstance } from "fastify";

import { getReportController } from "./controller";

export async function registerReportRoutes(app: FastifyInstance) {
  app.get("/api/v1/experiments/:experimentId/reports/:kind", getReportController);
}
