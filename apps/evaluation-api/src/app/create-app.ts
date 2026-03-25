import Fastify from "fastify";

import { registerCors } from "../plugins/cors";
import { registerArtifactRoutes } from "../modules/artifacts/routes";
import { registerCatalogRoutes } from "../modules/catalog/routes";
import { registerExperimentRoutes } from "../modules/experiments/routes";
import { registerHealthRoutes } from "../modules/health/routes";
import { registerReportRoutes } from "../modules/reports/routes";
import { registerRunRoutes } from "../modules/runs/routes";

export async function createEvaluationApiApp() {
  const app = Fastify({
    logger: true,
  });

  await registerCors(app);
  await registerHealthRoutes(app);
  await registerCatalogRoutes(app);
  await registerExperimentRoutes(app);
  await registerRunRoutes(app);
  await registerArtifactRoutes(app);
  await registerReportRoutes(app);

  return app;
}
