import Fastify from "fastify";

import { registerCors } from "../plugins/cors";
import { registerConversationActionRoutes } from "../modules/actions/routes";
import { registerConversationRoutes } from "../modules/conversations/routes";
import { registerConversationEventRoutes } from "../modules/events/routes";
import { registerConversationEventStreamRoutes } from "../modules/events-stream/routes";
import { registerHealthRoutes } from "../modules/health/routes";
import { registerConversationRunRoutes } from "../modules/runs/routes";

export async function createConversationApiApp() {
  const app = Fastify({
    logger: true,
  });

  await registerCors(app);
  await registerHealthRoutes(app);
  await registerConversationRoutes(app);
  await registerConversationEventRoutes(app);
  await registerConversationEventStreamRoutes(app);
  await registerConversationRunRoutes(app);
  await registerConversationActionRoutes(app);

  return app;
}
