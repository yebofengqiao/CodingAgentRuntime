import type { FastifyReply, FastifyRequest } from "fastify";

import { settings } from "@openhands-rl/backend-core/config";
import { resolveAllowedCorsOrigin } from "@openhands-rl/backend-core/shared";

import { formatSse } from "../../shared/http/sse";
import { presentStreamNotFound } from "./presenter";
import { presentConversationPacket } from "../events/presenter";
import {
  conversationExists,
  getConversationChannel,
  getRedisClient,
  replayConversationPackets,
} from "./service";

type ConversationParams = { conversationId: string };

export async function streamConversationEventsController(
  request: FastifyRequest<{ Params: ConversationParams; Querystring: { after_seq?: string } }>,
  reply: FastifyReply,
) {
  const requestOrigin =
    typeof request.headers.origin === "string" ? request.headers.origin : undefined;
  const { conversationId } = request.params;
  if (!(await conversationExists(conversationId))) {
    return reply.code(404).send(presentStreamNotFound());
  }

  const allowedOrigin = requestOrigin
    ? resolveAllowedCorsOrigin({
        configuredFrontendUrl:
          process.env.CONVERSATION_FRONTEND_URL ??
          process.env.VITE_CONVERSATION_FRONTEND_URL ??
          settings.conversationFrontendUrl,
        requestOrigin,
        nodeEnv: process.env.NODE_ENV,
      })
    : null;

  if (requestOrigin && !allowedOrigin) {
    return reply.code(403).send({
      detail: "Origin not allowed",
    });
  }

  const queryAfterSeq = Number(request.query.after_seq ?? "0");
  const headerValue = request.headers["last-event-id"];
  const headerAfterSeq =
    typeof headerValue === "string"
      ? Number(headerValue)
      : Number(Array.isArray(headerValue) ? headerValue[0] : "0");
  const afterSeq = Math.max(queryAfterSeq, Number.isFinite(headerAfterSeq) ? headerAfterSeq : 0);

  reply.hijack();
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    Vary: "Origin",
  };
  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  reply.raw.writeHead(200, headers);
  reply.raw.flushHeaders();

  const subscriber = getRedisClient().duplicate();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const write = (chunk: string) => {
    if (!closed) {
      reply.raw.write(chunk);
    }
  };

  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    subscriber.disconnect();
    reply.raw.end();
  };

  request.raw.on("close", cleanup);
  request.raw.on("error", cleanup);

  try {
    for (const packet of await replayConversationPackets(conversationId, afterSeq)) {
      write(formatSse(presentConversationPacket(packet)));
    }

    await subscriber.subscribe(getConversationChannel(conversationId));
    subscriber.on("message", (_channel, message) => {
      try {
        write(formatSse(presentConversationPacket(JSON.parse(message))));
      } catch {
        write(
          formatSse({
            type: "error",
            data: {
              code: "StreamPacketParseFailed",
              detail: "Failed to parse stream packet",
            },
          }),
        );
      }
    });

    heartbeat = setInterval(() => {
      write(": keep-alive\n\n");
    }, 15_000);
  } catch {
    cleanup();
  }
}
