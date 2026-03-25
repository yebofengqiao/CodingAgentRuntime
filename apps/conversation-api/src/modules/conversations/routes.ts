import type { FastifyInstance } from "fastify";

import {
  createConversationController,
  deleteConversationController,
  listConversationsController,
  submitConversationMessageController,
} from "./controller";

export async function registerConversationRoutes(app: FastifyInstance) {
  app.get("/conversations", listConversationsController);
  app.post("/conversations", createConversationController);
  app.delete("/conversations/:conversationId", deleteConversationController);
  app.post("/conversations/:conversationId/messages", submitConversationMessageController);
}
