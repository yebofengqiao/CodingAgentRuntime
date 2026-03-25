import { randomUUID } from "node:crypto";

import type { EvaluationExperiment, EvaluationRun } from "@prisma/client";

import { prisma } from "../../infrastructure/persistence/clients";
import { utcNow } from "../../shared";
import { mapRun, toJsonValue } from "../models";
import type {
  ExperimentCreateRequest,
  ExperimentListRead,
  ExperimentRead,
  RunRead,
} from "../schemas";

export async function createExperimentGraph(
  request: ExperimentCreateRequest,
  totalRuns: number,
  aggregatePayload: Record<string, unknown> = {},
): Promise<{ id: string; status: string }> {
  const now = utcNow();
  const experimentId = randomUUID();
  const mode = request.mode ?? "strategy";
  const replicaCount = Math.max(1, request.replica_count ?? (mode === "business_fine_tuning" ? 3 : 1));
  const experiment = await prisma.evaluationExperiment.create({
    data: {
      id: experimentId,
      name: request.name,
      mode,
      status: "queued",
      caseIds: request.case_ids,
      baselineVariantId: request.baseline_variant_id,
      comparisonVariantIds: request.comparison_variant_ids,
      aggregatePayload: toJsonValue(aggregatePayload),
      reportPaths: {},
      totalRuns,
      completedRuns: 0,
      failedRuns: 0,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    },
  });

  // Business fine-tuning relies on repeated replicas for the same case/variant pair so we can
  // separate one-off wins from stable package-level improvements. Strategy mode keeps the same
  // path with replicaCount=1 by default, which lets both modes share the same run table.
  for (const caseId of request.case_ids) {
    for (const variantId of [request.baseline_variant_id, ...request.comparison_variant_ids]) {
      for (let replicaIndex = 1; replicaIndex <= replicaCount; replicaIndex += 1) {
        await prisma.evaluationRun.create({
          data: {
            id: randomUUID(),
            experimentId: experiment.id,
            caseId,
            variantId,
            replicaIndex,
            status: "queued",
            metrics: {},
            judgePayload: {},
            failureTaxonomy: [],
            artifactPaths: {},
            resultPayload: {},
            errorMessage: null,
            lockedBy: null,
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            finishedAt: null,
          },
        });
      }
    }
  }

  return { id: experiment.id, status: experiment.status };
}

export async function listExperiments(): Promise<ExperimentListRead[]> {
  const records = await prisma.evaluationExperiment.findMany({
    orderBy: { createdAt: "desc" },
  });

  return records.map((record) => ({
    id: record.id,
    name: record.name,
    mode: record.mode as "strategy" | "business_fine_tuning",
    status: record.status,
    case_count: Array.isArray(record.caseIds) ? record.caseIds.length : 0,
    variant_count: 1 + (Array.isArray(record.comparisonVariantIds) ? record.comparisonVariantIds.length : 0),
    total_runs: record.totalRuns,
    completed_runs: record.completedRuns,
    failed_runs: record.failedRuns,
    overall_success_rate: Number(((record.aggregatePayload as Record<string, unknown>)?.overall_success_rate ?? 0) || 0),
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  }));
}

function mapExperiment(record: EvaluationExperiment & { runs: EvaluationRun[] }): ExperimentRead {
  // The read model surfaces the highest observed replica index instead of trusting a duplicated
  // payload field so historical experiments stay readable even if they were created before the
  // API started returning replica_count explicitly.
  const replicaCount = Math.max(
    1,
    ...record.runs.map((run) => run.replicaIndex ?? 1),
  );
  return {
    id: record.id,
    name: record.name,
    mode: record.mode as "strategy" | "business_fine_tuning",
    status: record.status,
    replica_count: replicaCount,
    case_ids: record.caseIds as string[],
    baseline_variant_id: record.baselineVariantId,
    comparison_variant_ids: record.comparisonVariantIds as string[],
    total_runs: record.totalRuns,
    completed_runs: record.completedRuns,
    failed_runs: record.failedRuns,
    aggregate_payload: (record.aggregatePayload ?? {}) as Record<string, unknown>,
    report_paths: (record.reportPaths ?? {}) as Record<string, string>,
    runs: record.runs.map(mapRun),
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    started_at: record.startedAt?.toISOString() ?? null,
    finished_at: record.finishedAt?.toISOString() ?? null,
  };
}

export async function getExperiment(experimentId: string): Promise<ExperimentRead> {
  const experiment = await prisma.evaluationExperiment.findUnique({
    where: { id: experimentId },
    include: {
      runs: {
        orderBy: [{ caseId: "asc" }, { variantId: "asc" }, { replicaIndex: "asc" }],
      },
    },
  });
  if (!experiment) {
    throw new Error(`Experiment ${experimentId} not found`);
  }
  return mapExperiment(experiment);
}

export async function getExperimentRecord(experimentId: string) {
  return prisma.evaluationExperiment.findUnique({
    where: { id: experimentId },
  });
}

export async function updateExperimentRecord(
  experimentId: string,
  patch: {
    status?: string;
    completedRuns?: number;
    failedRuns?: number;
    aggregatePayload?: Record<string, unknown>;
    reportPaths?: Record<string, string>;
    errorMessage?: string | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  },
) {
  return prisma.evaluationExperiment.update({
    where: { id: experimentId },
    data: {
      status: patch.status,
      completedRuns: patch.completedRuns,
      failedRuns: patch.failedRuns,
      aggregatePayload:
        patch.aggregatePayload === undefined ? undefined : toJsonValue(patch.aggregatePayload),
      reportPaths: patch.reportPaths === undefined ? undefined : toJsonValue(patch.reportPaths),
      errorMessage: patch.errorMessage,
      startedAt: patch.startedAt,
      finishedAt: patch.finishedAt,
      updatedAt: utcNow(),
    },
  });
}

export async function getEvaluationRun(runId: string): Promise<RunRead> {
  const run = await prisma.evaluationRun.findUnique({
    where: { id: runId },
  });
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }
  return mapRun(run);
}

export async function getEvaluationRunRecord(runId: string) {
  return prisma.evaluationRun.findUnique({
    where: { id: runId },
  });
}

export async function markEvaluationRunStatus(
  runId: string,
  patch: {
    status: string;
    metrics?: Record<string, unknown>;
    judgePayload?: Record<string, unknown>;
    failureTaxonomy?: string[];
    artifactPaths?: Record<string, string>;
    resultPayload?: Record<string, unknown>;
    errorMessage?: string | null;
    lockedBy?: string | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  },
): Promise<RunRead> {
  const run = await prisma.evaluationRun.update({
    where: { id: runId },
    data: {
      status: patch.status,
      metrics: patch.metrics === undefined ? undefined : toJsonValue(patch.metrics),
      judgePayload: patch.judgePayload === undefined ? undefined : toJsonValue(patch.judgePayload),
      failureTaxonomy:
        patch.failureTaxonomy === undefined ? undefined : toJsonValue(patch.failureTaxonomy),
      artifactPaths: patch.artifactPaths === undefined ? undefined : toJsonValue(patch.artifactPaths),
      resultPayload: patch.resultPayload === undefined ? undefined : toJsonValue(patch.resultPayload),
      errorMessage: patch.errorMessage,
      lockedBy: patch.lockedBy,
      startedAt: patch.startedAt,
      finishedAt: patch.finishedAt,
      updatedAt: utcNow(),
    },
  });
  return mapRun(run);
}
