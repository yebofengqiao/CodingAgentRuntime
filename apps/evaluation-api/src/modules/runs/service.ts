import { ACTIVE_EVALUATION_RUN_STATUSES } from "@openhands-rl/backend-core/evaluation/models";
import {
  cancelEvaluationRun,
  getEvaluationRunRead,
  getExperimentRead,
  resetEvaluationRun,
} from "@openhands-rl/backend-core/evaluation/services/experiment-service";
import { readRunTrace } from "@openhands-rl/backend-core/evaluation/services/trace-reader";
import { getEvaluationQueue } from "@openhands-rl/backend-core/infrastructure/queue";

export async function getRunService(runId: string) {
  return getEvaluationRunRead(runId);
}

export async function startRunService(runId: string) {
  const run = await getEvaluationRunRead(runId);
  const experiment = await getExperimentRead(run.experiment_id);
  if (experiment.runs.some((item) => item.id !== runId && ACTIVE_EVALUATION_RUN_STATUSES.has(item.status))) {
    throw new Error("Another run in this experiment is currently in progress");
  }
  if (ACTIVE_EVALUATION_RUN_STATUSES.has(run.status)) {
    return { id: run.id, status: "running", started: false };
  }
  if (run.status !== "queued") {
    throw new Error(`Run ${runId} is not queued and cannot be started`);
  }
  await getEvaluationQueue().add(
    run.id,
    { runId: run.id },
    {
      jobId: run.id,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  return { id: run.id, status: "running", started: true };
}

export async function rerunRunService(runId: string) {
  const run = await resetEvaluationRun(runId);
  await getEvaluationQueue().add(
    run.id,
    { runId: run.id },
    {
      jobId: run.id,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  return { id: run.id, status: "running", started: true };
}

export async function cancelRunService(runId: string) {
  const run = await cancelEvaluationRun(runId);
  return { id: run.id, status: run.status, started: false };
}

export async function getRunTraceService(runId: string) {
  return readRunTrace(runId);
}
