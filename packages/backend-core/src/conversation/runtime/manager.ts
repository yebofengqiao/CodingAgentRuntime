import type { Event } from "@openhands-rl/runtime-core/Event";

import { getRedisClient } from "../../infrastructure/persistence/clients";
import type { ConversationPacket, ConversationRunRead } from "../domain/models";
import {
  appendConversationEventRecord,
  getConversationStatus,
  listConversationEvents,
  listConversationRuns,
  updateConversationRunStatusRecord,
  updateConversationStatusRecord,
} from "../infrastructure/repositories";

export function getConversationChannel(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export async function publishConversationPacket(
  conversationId: string,
  packet: ConversationPacket,
): Promise<void> {
  await getRedisClient().publish(getConversationChannel(conversationId), JSON.stringify(packet));
}

export async function setConversationStatus(conversationId: string, executionStatus: string) {
  const payload = await updateConversationStatusRecord(conversationId, executionStatus);
  await publishConversationPacket(conversationId, {
    type: "status",
    data: payload,
  });
  return payload;
}

export async function setConversationRunStatus(
  runId: string,
  input: {
    status: string;
    waitingActionId?: string | null;
    errorDetail?: string | null;
  },
): Promise<ConversationRunRead> {
  const mapped = await updateConversationRunStatusRecord(runId, input);
  await publishConversationPacket(mapped.conversation_id, {
    type: "run",
    data: mapped,
  });
  return mapped;
}

export async function appendConversationEventAndPublish(
  conversationId: string,
  event: Event,
) {
  const record = await appendConversationEventRecord(conversationId, event);
  await publishConversationPacket(conversationId, {
    type: "event",
    data: record,
  });
  return record;
}

export async function replayConversationPackets(
  conversationId: string,
  afterSeq: number,
): Promise<ConversationPacket[]> {
  const packets: ConversationPacket[] = [];
  const events = await listConversationEvents(conversationId, afterSeq, 1000);
  for (const event of events) {
    packets.push({ type: "event", data: event });
  }
  const executionStatus = await getConversationStatus(conversationId);
  packets.push({
    type: "status",
    data: {
      execution_status: executionStatus,
    },
  });
  const runs = await listConversationRuns(conversationId, 50);
  for (const run of [...runs].reverse()) {
    packets.push({
      type: "run",
      data: run,
    });
  }
  return packets;
}
