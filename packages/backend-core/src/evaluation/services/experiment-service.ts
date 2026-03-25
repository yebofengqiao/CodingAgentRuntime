import { rmSync } from "node:fs";

import { getCase, getVariant } from "../catalog/service";
import {
  createExperimentGraph,
  getEvaluationRun,
  getEvaluationRunRecord,
  getExperiment,
  listExperiments,
  markEvaluationRunStatus,
  updateExperimentRecord,
} from "../repositories/experiment-repository";
import {
  clearEvaluationRunCancellation,
  requestEvaluationRunCancellation,
} from "../repositories/cancellation-store";
import { ACTIVE_EVALUATION_RUN_STATUSES } from "../models";
import type {
  DesignSnapshot,
  ExperimentCreateRequest,
  ExperimentListRead,
  ExperimentRead,
  RunRead,
} from "../schemas";
import { writeExperimentReports } from "./report-generator";
import {
  assertComparableStrategies,
  resolveStrategyBundleByVariant,
} from "./strategy-resolver";

function normalizeExperimentMode(
  request: ExperimentCreateRequest,
): { mode: "strategy" | "business_fine_tuning"; replicaCount: number } {
  const mode = request.mode ?? "strategy";
  const replicaCount = Math.max(1, request.replica_count ?? (mode === "business_fine_tuning" ? 3 : 1));
  return { mode, replicaCount };
}

function buildDesignSnapshot(request: ExperimentCreateRequest): DesignSnapshot {
  const { mode, replicaCount } = normalizeExperimentMode(request);
  const cases = request.case_ids.map((caseId) => {
    const item = getCase(caseId);
    return {
      id: item.id,
      name: item.name,
      project: item.project,
      task_family: item.task_family,
      tuning_axis: item.tuning_axis,
      difficulty: item.difficulty,
      context_mode: item.context_mode,
      source_path: item.source_path ?? "",
    };
  });

  const baselineVariant = getVariant(request.baseline_variant_id);
  const baselineStrategy = resolveStrategyBundleByVariant(baselineVariant, baselineVariant);
  const comparisonStrategies = request.comparison_variant_ids.map((variantId) => {
    const variant = getVariant(variantId);
    return resolveStrategyBundleByVariant(variant, baselineVariant);
  });

  const variants = [
    {
      id: baselineStrategy.variant_id,
      kind: baselineVariant.kind,
      description: baselineStrategy.description,
      changed_axis: "baseline",
      prompt_version: baselineStrategy.prompt_version,
      model_profile: baselineStrategy.model_profile,
      business_context_profile: baselineStrategy.business_context_profile,
      session_context_policy: baselineStrategy.session_context_policy,
      package_refs: baselineStrategy.context_packages,
      source_path: baselineVariant.source_path ?? "",
    },
    ...comparisonStrategies.map((strategy) => {
      const variant = getVariant(strategy.variant_id);
      return {
        id: strategy.variant_id,
        kind: variant.kind,
        description: strategy.description,
        changed_axis: strategy.changed_axis,
        prompt_version: strategy.prompt_version,
        model_profile: strategy.model_profile,
        business_context_profile: strategy.business_context_profile,
        session_context_policy: strategy.session_context_policy,
        package_refs: strategy.context_packages,
        source_path: variant.source_path ?? "",
      };
    }),
  ];

  return {
    mode,
    replica_count: replicaCount,
    baseline_variant_id: request.baseline_variant_id,
    comparison_variant_ids: request.comparison_variant_ids,
    changed_axes: Object.fromEntries(
      comparisonStrategies.map((strategy) => [strategy.variant_id, strategy.changed_axis]),
    ),
    cases,
    variants,
  };
}

export async function createExperiment(request: ExperimentCreateRequest) {
  const { mode, replicaCount } = normalizeExperimentMode(request);
  for (const caseId of request.case_ids) {
    getCase(caseId);
  }
  const baseline = getVariant(request.baseline_variant_id);
  if (baseline.kind !== mode) {
    throw new Error(
      `Baseline variant '${baseline.id}' is '${baseline.kind}', but experiment mode is '${mode}'`,
    );
  }
  const baselineStrategy = resolveStrategyBundleByVariant(baseline, baseline);
  for (const variantId of request.comparison_variant_ids) {
    const variant = getVariant(variantId);
    if (variant.kind !== mode) {
      throw new Error(
        `Comparison variant '${variantId}' is '${variant.kind}', but experiment mode is '${mode}'`,
      );
    }
    const strategy = resolveStrategyBundleByVariant(variant, baseline);
    const changedAxes = assertComparableStrategies(baselineStrategy, strategy);
    if (changedAxes.length !== 1) {
      const formatted = changedAxes.join(", ") || "none";
      throw new Error(
        `Variant '${variantId}' must change exactly one axis from baseline '${baseline.id}', found: ${formatted}`,
      );
    }
  }

  return createExperimentGraph(
    {
      ...request,
      mode,
      replica_count: replicaCount,
    },
    request.case_ids.length * (1 + request.comparison_variant_ids.length) * replicaCount,
    {
      design_snapshot: buildDesignSnapshot(request),
    },
  );
}

export async function listExperimentsRead(): Promise<ExperimentListRead[]> {
  return listExperiments();
}

export async function getExperimentRead(experimentId: string): Promise<ExperimentRead> {
  return getExperiment(experimentId);
}

export async function getEvaluationRunRead(runId: string): Promise<RunRead> {
  return getEvaluationRun(runId);
}

export async function getEvaluationRunRecordOrThrow(runId: string) {
  const run = await getEvaluationRunRecord(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }
  return run;
}

export async function markEvaluationRun(
  runId: string,
  patch: Parameters<typeof markEvaluationRunStatus>[1],
): Promise<RunRead> {
  return markEvaluationRunStatus(runId, patch);
}

export async function resetEvaluationRun(runId: string): Promise<RunRead> {
  const run = await getEvaluationRunRecordOrThrow(runId);
  if (ACTIVE_EVALUATION_RUN_STATUSES.has(run.status)) {
    throw new Error(`Run ${runId} is currently in progress and cannot be rerun`);
  }

  for (const path of Object.values((run.artifactPaths ?? {}) as Record<string, string>)) {
    rmSync(path, { force: true });
  }

  const experiment = await getExperimentRead(run.experimentId);
  for (const path of Object.values(experiment.report_paths ?? {})) {
    rmSync(path, { force: true });
  }

  const updated = await markEvaluationRunStatus(runId, {
    status: "queued",
    metrics: {},
    judgePayload: {},
    failureTaxonomy: [],
    artifactPaths: {},
    resultPayload: {},
    errorMessage: null,
    lockedBy: null,
    startedAt: null,
    finishedAt: null,
  });
  await updateExperimentRecord(run.experimentId, {
    status: "queued",
    completedRuns: 0,
    failedRuns: 0,
    aggregatePayload: {
      design_snapshot:
        (experiment.aggregate_payload?.design_snapshot as Record<string, unknown> | undefined) ?? {},
    },
    reportPaths: {},
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
  });
  await refreshExperiment(run.experimentId);
  return updated;
}

export async function cancelEvaluationRun(runId: string): Promise<RunRead> {
  const run = await getEvaluationRunRecordOrThrow(runId);
  if (["completed", "failed", "cancelled"].includes(run.status)) {
    throw new Error(`Run ${runId} is already finished and cannot be cancelled`);
  }

  const nextStatus = run.status === "queued" ? "cancelled" : "cancelling";
  const updated = await markEvaluationRunStatus(runId, {
    status: nextStatus,
    errorMessage: "Cancelled by user.",
    lockedBy: nextStatus === "cancelled" ? null : run.lockedBy,
    startedAt: run.startedAt,
    finishedAt: nextStatus === "cancelled" ? new Date() : run.finishedAt,
  });
  await requestEvaluationRunCancellation(runId);
  await refreshExperiment(run.experimentId);
  return updated;
}

export async function settleCancelledRun(
  runId: string,
  message = "Cancelled by user.",
): Promise<RunRead> {
  const run = await getEvaluationRunRecordOrThrow(runId);
  const updated = await markEvaluationRunStatus(runId, {
    status: "cancelled",
    errorMessage: message,
    lockedBy: null,
    startedAt: run.startedAt,
    finishedAt: new Date(),
  });
  await clearEvaluationRunCancellation(runId);
  await refreshExperiment(run.experimentId);
  return updated;
}

export async function refreshExperiment(experimentId: string): Promise<ExperimentRead> {
  const experiment = await getExperimentRead(experimentId);
  const summary = await writeExperimentReports(experiment);
  await updateExperimentRecord(experimentId, {
    status: summary.status,
    completedRuns: summary.completedRuns,
    failedRuns: summary.failedRuns,
    aggregatePayload: summary.aggregatePayload,
    reportPaths: summary.reportPaths,
    finishedAt: summary.finishedAt,
  });
  return getExperimentRead(experimentId);
}
