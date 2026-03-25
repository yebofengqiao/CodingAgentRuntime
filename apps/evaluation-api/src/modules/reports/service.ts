import { getExperimentRead } from "@openhands-rl/backend-core/evaluation/services/experiment-service";

export async function getReportPathService(experimentId: string, kind: string) {
  const experiment = await getExperimentRead(experimentId);
  return experiment.report_paths[kind] ?? null;
}
