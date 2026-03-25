import type { Worker } from "bullmq";

export function registerWorkerLogging(worker: Worker) {
  worker.on("failed", (job, error) => {
    console.error(`[worker:${worker.name}] job failed`, job?.id, error);
  });

  worker.on("completed", (job) => {
    console.info(`[worker:${worker.name}] job completed`, job.id);
  });
}
