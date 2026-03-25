import type { FastifyInstance } from "fastify";

import {
  createExperimentController,
  getExperimentController,
  listExperimentsController,
  startExperimentController,
} from "./controller";

export async function registerExperimentRoutes(app: FastifyInstance) {
  app.get("/api/v1/experiments", listExperimentsController);
  app.post("/api/v1/experiments", createExperimentController);
  app.get("/api/v1/experiments/:experimentId", getExperimentController);
  app.post("/api/v1/experiments/:experimentId/run", startExperimentController);
}
