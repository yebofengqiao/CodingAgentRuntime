import type { FastifyInstance } from "fastify";

import { getHealthController } from "./controller";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/healthz", getHealthController);
}
