import { processEvaluationRun } from "@openhands-rl/backend-core/evaluation/services/run-orchestrator";

export async function processEvaluationRunJob(runId: string): Promise<void> {
  await processEvaluationRun(runId);
}
