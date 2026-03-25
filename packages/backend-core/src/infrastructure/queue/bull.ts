import { Queue } from "bullmq";

import { settings } from "../../config/settings";

export const conversationQueueName = "conversation-runs";
export const evaluationQueueName = "evaluation-runs";

let conversationQueue: Queue | null = null;
let evaluationQueue: Queue | null = null;

export function createBullConnection() {
  const url = new URL(settings.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || "6379"),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname ? Number(url.pathname.replace("/", "") || "0") : 0,
    maxRetriesPerRequest: null,
  };
}

export function getConversationQueue(): Queue {
  if (!conversationQueue) {
    conversationQueue = new Queue(conversationQueueName, {
      connection: createBullConnection(),
    });
  }
  return conversationQueue;
}

export function getEvaluationQueue(): Queue {
  if (!evaluationQueue) {
    evaluationQueue = new Queue(evaluationQueueName, {
      connection: createBullConnection(),
    });
  }
  return evaluationQueue;
}
