import { getEvaluationRunRead } from "@openhands-rl/backend-core/evaluation/services/experiment-service";

export async function getArtifactPathService(runId: string, kind: string) {
  const run = await getEvaluationRunRead(runId);
  return run.artifact_paths[`${kind}_file`] ?? run.artifact_paths[kind] ?? null;
}
