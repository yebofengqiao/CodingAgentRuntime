import type {
  ConversationEvent,
  ConversationPacket,
  ConversationRun,
} from "../model/types";
import { resolveConversationApiBaseUrl } from "./client";

type ConversationRealtimeHandlers = {
  conversationId: string;
  getAfterSeq: () => number;
  onEvent: (event: ConversationEvent) => void;
  onStatus: (status: string) => void;
  onRun: (run: ConversationRun) => void;
  onError: (message: string) => void;
};

export function connectConversationStream(handlers: ConversationRealtimeHandlers): () => void {
  let source: EventSource | null = null;
  let manuallyClosed = false;

  const connect = () => {
    const streamUrl =
      `${resolveConversationApiBaseUrl()}/conversations/${handlers.conversationId}/events/stream?after_seq=${handlers.getAfterSeq()}`;

    source = new EventSource(streamUrl);
    source.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data) as ConversationPacket;
        if (packet.type === "event") {
          handlers.onEvent(packet.data);
          return;
        }
        if (packet.type === "status" || packet.type === "run_sync") {
          handlers.onStatus(packet.data.execution_status);
          return;
        }
        if (packet.type === "run") {
          handlers.onRun(packet.data);
          return;
        }
        if (packet.type === "error") {
          handlers.onError(`${packet.data.code}: ${packet.data.detail}`);
        }
      } catch (error) {
        handlers.onError(`SSE payload parse failed: ${String(error)}`);
      }
    };

    source.onerror = () => {
      if (!manuallyClosed) {
        handlers.onError("SSE connection error");
      }
    };
  };

  connect();

  return () => {
    manuallyClosed = true;
    source?.close();
  };
}
