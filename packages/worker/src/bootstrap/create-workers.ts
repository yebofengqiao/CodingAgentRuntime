import { Worker } from "bullmq";

import {
  conversationQueueName,
  createBullConnection,
  evaluationQueueName,
} from "@openhands-rl/backend-core/infrastructure/queue";
import { settings } from "@openhands-rl/backend-core/config";

import { processConversationRun } from "../jobs/conversation/processor";
import { processEvaluationRunJob } from "../jobs/evaluation/processor";
import { registerWorkerLogging } from "../shared/logging";
import type { ConversationJob, EvaluationJob } from "../shared/types";

export function createWorkers() {
  const conversationWorker = new Worker<ConversationJob>(
    conversationQueueName,
    async (job) => {
      await processConversationRun(job.data);
    },
    {
      connection: createBullConnection(),
      concurrency: 1,
    },
  );

  const evaluationWorker = new Worker<EvaluationJob>(
    evaluationQueueName,
    async (job) => {
      await processEvaluationRunJob(job.data.runId);
    },
    {
      connection: createBullConnection(),
      concurrency: settings.evaluationWorkerConcurrency,
    },
  );

  registerWorkerLogging(conversationWorker);
  registerWorkerLogging(evaluationWorker);

  return {
    conversationWorker,
    evaluationWorker,
  };
}
