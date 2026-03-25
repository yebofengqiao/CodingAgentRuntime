import { randomUUID } from "node:crypto";

import type { Conversation } from "@prisma/client";
import type { Event } from "@openhands-rl/runtime-core/Event";

import { getMongoDb, prisma } from "../../infrastructure/persistence/clients";
import { isoString, utcNow } from "../../shared";
import type {
  ConversationCreated,
  ConversationEventDocument,
  ConversationEventRead,
  ConversationItem,
  ConversationRunRead,
} from "../domain/models";

function mapConversation(record: Conversation): ConversationItem {
  return {
    conversation_id: record.id,
    execution_status: record.executionStatus,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    last_event_at: isoString(record.lastEventAt),
  };
}

function mapRun(record: {
  id: string;
  conversationId: string;
  status: string;
  waitingActionId: string | null;
  errorDetail: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ConversationRunRead {
  return {
    run_id: record.id,
    conversation_id: record.conversationId,
    status: record.status,
    waiting_action_id: record.waitingActionId,
    error_detail: record.errorDetail,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

function mapEvent(record: ConversationEventDocument): ConversationEventRead {
  return {
    seq: record.seq,
    event_id: record.eventId,
    kind: record.kind,
    source: record.source,
    payload: record.payload,
    timestamp: record.timestamp.toISOString(),
  };
}

export async function createConversationRecord(): Promise<ConversationCreated> {
  const now = utcNow();
  const record = await prisma.conversation.create({
    data: {
      id: randomUUID(),
      executionStatus: "idle",
      lastSeq: 0,
      createdAt: now,
      updatedAt: now,
      lastEventAt: null,
    },
  });
  return mapConversation(record);
}

export async function listConversationRecords(): Promise<ConversationItem[]> {
  const records = await prisma.conversation.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return records.map(mapConversation);
}

export async function getConversationRecord(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
  });
}

export async function conversationExists(conversationId: string): Promise<boolean> {
  return Boolean(await getConversationRecord(conversationId));
}

export async function getConversationStatus(conversationId: string): Promise<string> {
  const record = await getConversationRecord(conversationId);
  if (!record) {
    throw new Error("Conversation not found");
  }
  return record.executionStatus;
}

export async function updateConversationStatusRecord(conversationId: string, executionStatus: string) {
  const record = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      executionStatus,
      updatedAt: utcNow(),
    },
  });
  return {
    execution_status: record.executionStatus,
  };
}

export async function listConversationEvents(
  conversationId: string,
  afterSeq = 0,
  limit = 200,
): Promise<ConversationEventRead[]> {
  const db = await getMongoDb();
  const docs = await db
    .collection<ConversationEventDocument>("conversation_events")
    .find({
      conversationId,
      seq: {
        $gt: afterSeq,
      },
    })
    .sort({ seq: 1 })
    .limit(limit)
    .toArray();
  return docs.map(mapEvent);
}

export async function appendConversationEventRecord(
  conversationId: string,
  event: Event,
): Promise<ConversationEventRead> {
  const timestamp = new Date(event.timestamp);
  const nextSeq = await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    const seq = conversation.lastSeq + 1;
    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastSeq: seq,
        lastEventAt: timestamp,
        updatedAt: utcNow(),
      },
    });
    return seq;
  });

  const record: ConversationEventDocument = {
    conversationId,
    seq: nextSeq,
    eventId: event.id,
    kind: event.kind,
    source: event.source,
    payload: event.payload,
    timestamp,
  };

  const db = await getMongoDb();
  await db.collection<ConversationEventDocument>("conversation_events").insertOne(record);
  return mapEvent(record);
}

export async function createConversationRunRecord(conversationId: string): Promise<ConversationRunRead> {
  const now = utcNow();
  const record = await prisma.conversationRun.create({
    data: {
      id: randomUUID(),
      conversationId,
      status: "queued",
      waitingActionId: null,
      errorDetail: null,
      createdAt: now,
      updatedAt: now,
    },
  });
  return mapRun(record);
}

export async function listConversationRuns(
  conversationId: string,
  limit = 100,
): Promise<ConversationRunRead[]> {
  const records = await prisma.conversationRun.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return records.map(mapRun);
}

export async function getConversationRun(
  conversationId: string,
  runId: string,
): Promise<ConversationRunRead | null> {
  const record = await prisma.conversationRun.findFirst({
    where: {
      id: runId,
      conversationId,
    },
  });
  return record ? mapRun(record) : null;
}

export async function getConversationRunRecord(runId: string) {
  return prisma.conversationRun.findUnique({
    where: { id: runId },
  });
}

export async function updateConversationRunStatusRecord(
  runId: string,
  input: {
    status: string;
    waitingActionId?: string | null;
    errorDetail?: string | null;
  },
): Promise<ConversationRunRead> {
  const record = await prisma.conversationRun.update({
    where: { id: runId },
    data: {
      status: input.status,
      waitingActionId:
        input.waitingActionId === undefined ? undefined : input.waitingActionId,
      errorDetail: input.errorDetail === undefined ? undefined : input.errorDetail,
      updatedAt: utcNow(),
    },
  });
  return mapRun(record);
}

export async function getLatestWaitingRun(conversationId: string) {
  const record = await prisma.conversationRun.findFirst({
    where: {
      conversationId,
      status: "waiting_approval",
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
  return record ? mapRun(record) : null;
}

export async function getActionEvent(conversationId: string, actionId: string) {
  const db = await getMongoDb();
  const doc = await db.collection<ConversationEventDocument>("conversation_events").findOne({
    conversationId,
    eventId: actionId,
    kind: "action",
  });
  return doc ? mapEvent(doc) : null;
}

export async function deleteConversationRecord(conversationId: string): Promise<boolean> {
  const record = await getConversationRecord(conversationId);
  if (!record) {
    return false;
  }
  await prisma.conversation.delete({
    where: {
      id: conversationId,
    },
  });
  const db = await getMongoDb();
  await db.collection("conversation_events").deleteMany({ conversationId });
  return true;
}
