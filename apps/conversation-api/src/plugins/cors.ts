import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";

import { settings } from "@openhands-rl/backend-core/config";
import { resolveAllowedCorsOrigin } from "@openhands-rl/backend-core/shared";

export async function registerCors(app: FastifyInstance) {
  const configuredFrontendUrl =
    process.env.CONVERSATION_FRONTEND_URL ??
    process.env.VITE_CONVERSATION_FRONTEND_URL ??
    settings.conversationFrontendUrl;

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(
        null,
        resolveAllowedCorsOrigin({
          configuredFrontendUrl,
          requestOrigin: origin,
          nodeEnv: process.env.NODE_ENV,
        }) ?? false,
      );
    },
    credentials: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  });
}
