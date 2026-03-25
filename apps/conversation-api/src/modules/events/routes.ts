import type { FastifyInstance } from "fastify";

import { listConversationEventsController } from "./controller";

export async function registerConversationEventRoutes(app: FastifyInstance) {
  app.get("/conversations/:conversationId/events", listConversationEventsController);
}
