import type { FastifyInstance } from "fastify";

import { streamConversationEventsController } from "./controller";

export async function registerConversationEventStreamRoutes(app: FastifyInstance) {
  app.get(
    "/conversations/:conversationId/events/stream",
    streamConversationEventsController,
  );
}
