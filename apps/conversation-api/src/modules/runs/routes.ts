import type { FastifyInstance } from "fastify";

import { getConversationRunController, listConversationRunsController } from "./controller";

export async function registerConversationRunRoutes(app: FastifyInstance) {
  app.get("/conversations/:conversationId/runs", listConversationRunsController);
  app.get("/conversations/:conversationId/runs/:runId", getConversationRunController);
}
