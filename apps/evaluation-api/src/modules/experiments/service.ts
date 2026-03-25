import { ACTIVE_EVALUATION_RUN_STATUSES } from "@openhands-rl/backend-core/evaluation/models";
import {
  createExperiment,
  getExperimentRead,
  listExperimentsRead,
} from "@openhands-rl/backend-core/evaluation/services/experiment-service";
import { getEvaluationQueue } from "@openhands-rl/backend-core/infrastructure/queue";

export type CreateExperimentRequest = {
  name: string;
  mode?: "strategy" | "business_fine_tuning";
  replica_count?: number;
  case_ids: string[];
  baseline_variant_id: string;
  comparison_variant_ids: string[];
};

export async function listExperimentsService() {
  return listExperimentsRead();
}

export async function createExperimentService(input: CreateExperimentRequest) {
  return createExperiment(input);
}

export async function getExperimentService(experimentId: string) {
  return getExperimentRead(experimentId);
}

export async function startExperimentService(experimentId: string) {
  const experiment = await getExperimentRead(experimentId);
  if (experiment.runs.some((run) => ACTIVE_EVALUATION_RUN_STATUSES.has(run.status))) {
    return { id: experiment.id, started: false };
  }
  const queuedRuns = experiment.runs.filter((run) => run.status === "queued");
  if (queuedRuns.length === 0) {
    throw new Error(`Experiment ${experimentId} has no queued runs to start`);
  }
  const queue = getEvaluationQueue();
  for (const run of queuedRuns) {
    await queue.add(
      run.id,
      { runId: run.id },
      {
        jobId: run.id,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
  return { id: experiment.id, started: true };
}
