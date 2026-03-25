import { Prisma } from "@prisma/client";

import type { RunRead } from "./schemas";
import { isoString } from "../shared/time";

export const ACTIVE_EVALUATION_RUN_STATUSES = new Set([
  "preparing_workspace",
  "building_prompt",
  "running_agent",
  "judging",
  "writing_artifacts",
  "cancelling",
]);

export const FAILED_LIKE_STATUSES = new Set(["failed", "cancelled"]);

export type EvaluationRunTraceDocument = {
  runId: string;
  index: number;
  kind: string;
  source: string;
  toolName: string | null;
  summary: string;
  payload: Record<string, unknown>;
  timestamp: Date | null;
};

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

export function mapRun(record: {
  id: string;
  experimentId: string;
  caseId: string;
  variantId: string;
  replicaIndex: number;
  status: string;
  metrics: unknown;
  judgePayload: unknown;
  failureTaxonomy: unknown;
  artifactPaths: unknown;
  resultPayload: unknown;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): RunRead {
  const resultPayload = (record.resultPayload ?? {}) as Record<string, unknown>;
  return {
    id: record.id,
    experiment_id: record.experimentId,
    case_id: record.caseId,
    variant_id: record.variantId,
    replica_index: record.replicaIndex,
    status: record.status,
    metrics: (record.metrics ?? {}) as Record<string, unknown>,
    judge_payload: (record.judgePayload ?? {}) as Record<string, unknown>,
    failure_bucket: Array.isArray(resultPayload.failure_bucket)
      ? (resultPayload.failure_bucket as string[])
      : Array.isArray(record.failureTaxonomy)
        ? (record.failureTaxonomy as string[])
        : [],
    suspected_gap: Array.isArray(resultPayload.suspected_gap)
      ? (resultPayload.suspected_gap as string[])
      : [],
    suspected_root_cause: Array.isArray(resultPayload.suspected_root_cause)
      ? (resultPayload.suspected_root_cause as string[])
      : [],
    strategy_snapshot:
      resultPayload.strategy_snapshot && typeof resultPayload.strategy_snapshot === "object"
        ? (resultPayload.strategy_snapshot as Record<string, unknown>)
        : {},
    artifact_paths: (record.artifactPaths ?? {}) as Record<string, string>,
    result_payload: resultPayload,
    error_message: record.errorMessage,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    started_at: isoString(record.startedAt),
    finished_at: isoString(record.finishedAt),
  };
}
