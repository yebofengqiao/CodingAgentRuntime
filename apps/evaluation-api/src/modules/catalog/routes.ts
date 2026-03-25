import type { FastifyInstance } from "fastify";

import { listCasesController, listVariantsController } from "./controller";

export async function registerCatalogRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalog/cases", listCasesController);
  app.get("/api/v1/catalog/variants", listVariantsController);
}
