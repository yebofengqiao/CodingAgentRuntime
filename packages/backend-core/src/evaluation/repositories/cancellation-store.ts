import { getRedisClient } from "../../infrastructure/persistence/clients";

export async function requestEvaluationRunCancellation(runId: string): Promise<boolean> {
  await getRedisClient().set(`eval:cancel:${runId}`, "1", "EX", 3600);
  return true;
}

export async function isEvaluationRunCancellationRequested(runId: string): Promise<boolean> {
  return (await getRedisClient().get(`eval:cancel:${runId}`)) === "1";
}

export async function clearEvaluationRunCancellation(runId: string): Promise<void> {
  await getRedisClient().del(`eval:cancel:${runId}`);
}
