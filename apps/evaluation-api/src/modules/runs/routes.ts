import type { FastifyInstance } from "fastify";

import {
  cancelRunController,
  getRunController,
  getRunTraceController,
  rerunRunController,
  startRunController,
} from "./controller";

export async function registerRunRoutes(app: FastifyInstance) {
  app.get("/api/v1/runs/:runId", getRunController);
  app.post("/api/v1/runs/:runId/run", startRunController);
  app.post("/api/v1/runs/:runId/rerun", rerunRunController);
  app.post("/api/v1/runs/:runId/cancel", cancelRunController);
  app.get("/api/v1/runs/:runId/trace-events", getRunTraceController);
}
