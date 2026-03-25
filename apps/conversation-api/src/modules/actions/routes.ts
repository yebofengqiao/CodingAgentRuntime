import type { FastifyInstance } from "fastify";

import {
  approveConversationActionController,
  rejectConversationActionController,
} from "./controller";

export async function registerConversationActionRoutes(app: FastifyInstance) {
  app.post(
    "/conversations/:conversationId/actions/:actionId/approve",
    approveConversationActionController,
  );
  app.post(
    "/conversations/:conversationId/actions/:actionId/reject",
    rejectConversationActionController,
  );
}
