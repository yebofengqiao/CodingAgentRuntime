import { joinApiUrl, requestJson } from "./http";
import type {
  CatalogCaseSummary,
  CatalogVariantSummary,
  ExperimentCreatePayload,
  ExperimentListItem,
  ExperimentRead,
  ExperimentStartResponse,
  RunActionResponse,
  RunTraceRead,
} from "../types/evaluation";

export function resolveEvaluationApiBaseUrl(): string {
  return import.meta.env.VITE_EVALUATION_API_BASE_URL ?? "http://127.0.0.1:4001";
}

export function listCases() {
  return requestJson<CatalogCaseSummary[]>(resolveEvaluationApiBaseUrl(), "/api/v1/catalog/cases");
}

export function listVariants() {
  return requestJson<CatalogVariantSummary[]>(
    resolveEvaluationApiBaseUrl(),
    "/api/v1/catalog/variants",
  );
}

export function createExperiment(payload: ExperimentCreatePayload) {
  return requestJson<{ id: string; status: string }>(
    resolveEvaluationApiBaseUrl(),
    "/api/v1/experiments",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function listExperiments() {
  return requestJson<ExperimentListItem[]>(resolveEvaluationApiBaseUrl(), "/api/v1/experiments");
}

export function getExperiment(experimentId: string) {
  return requestJson<ExperimentRead>(
    resolveEvaluationApiBaseUrl(),
    `/api/v1/experiments/${experimentId}`,
  );
}

export function startExperiment(experimentId: string) {
  return requestJson<ExperimentStartResponse>(
    resolveEvaluationApiBaseUrl(),
    `/api/v1/experiments/${experimentId}/run`,
    {
      method: "POST",
    },
  );
}

export function getRunTraceEvents(runId: string) {
  return requestJson<RunTraceRead>(
    resolveEvaluationApiBaseUrl(),
    `/api/v1/runs/${runId}/trace-events`,
  );
}

export function startRun(runId: string) {
  return requestJson<RunActionResponse>(
    resolveEvaluationApiBaseUrl(),
    `/api/v1/runs/${runId}/run`,
    {
      method: "POST",
    },
  );
}

export function rerunRun(runId: string) {
  return requestJson<RunActionResponse>(
    resolveEvaluationApiBaseUrl(),
    `/api/v1/runs/${runId}/rerun`,
    {
      method: "POST",
    },
  );
}

export function cancelRun(runId: string) {
  return requestJson<RunActionResponse>(
    resolveEvaluationApiBaseUrl(),
    `/api/v1/runs/${runId}/cancel`,
    {
      method: "POST",
    },
  );
}

export function getArtifactUrl(runId: string, kind: string) {
  return joinApiUrl(resolveEvaluationApiBaseUrl(), `/api/v1/artifacts/${runId}/${kind}`);
}

export function getExperimentReportUrl(experimentId: string, kind: string) {
  return joinApiUrl(
    resolveEvaluationApiBaseUrl(),
    `/api/v1/experiments/${experimentId}/reports/${kind}`,
  );
}
