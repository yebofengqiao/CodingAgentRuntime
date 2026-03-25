import { PrismaClient } from "@prisma/client";
import IORedis from "ioredis";
import { MongoClient } from "mongodb";

import { settings } from "../../config/settings";

declare global {
  // eslint-disable-next-line no-var
  var __openhandsPrisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __openhandsMongo: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var __openhandsRedis: IORedis | undefined;
}

export const prisma =
  globalThis.__openhandsPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__openhandsPrisma = prisma;
}

export function getRedisClient(): IORedis {
  if (!globalThis.__openhandsRedis) {
    globalThis.__openhandsRedis = new IORedis(settings.redisUrl, {
      maxRetriesPerRequest: null,
    });
  }
  return globalThis.__openhandsRedis;
}

export const mongoClient = globalThis.__openhandsMongo ?? new MongoClient(settings.mongodbUrl);

if (process.env.NODE_ENV !== "production") {
  globalThis.__openhandsMongo = mongoClient;
}

let mongoConnected = false;
let indexesReady = false;

export async function getMongoDb() {
  if (!mongoConnected) {
    await mongoClient.connect();
    mongoConnected = true;
  }
  const dbName = new URL(settings.mongodbUrl).pathname.replace(/^\//, "") || "openhands_rl";
  const db = mongoClient.db(dbName);
  if (!indexesReady) {
    await db.collection("conversation_events").createIndex({ conversationId: 1, seq: 1 }, { unique: true });
    await db.collection("conversation_events").createIndex({ conversationId: 1, timestamp: 1 });
    await db.collection("evaluation_run_traces").createIndex({ runId: 1, index: 1 }, { unique: true });
    await db.collection("artifact_index").createIndex({ scope: 1, scopeId: 1, kind: 1 });
    indexesReady = true;
  }
  return db;
}
