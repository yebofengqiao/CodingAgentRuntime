import { settings } from "../../config/settings";
import { buildRunArtifactPaths } from "../artifacts/manager";
import { getCase, getVariant } from "../catalog/service";
import { RunCancelledError } from "../executors/base";
import { createMockExecutorResult } from "../executors/mock";
import { runRuntimeExecutor } from "../executors/runtime";
import {
  clearEvaluationRunCancellation,
  isEvaluationRunCancellationRequested,
} from "../repositories/cancellation-store";
import { storeRunTrace } from "../repositories/trace-repository";
import {
  cleanupWorkspace,
  exportWorkspaceDiff,
  prepareWorkspace,
  type WorkspaceHandle,
} from "./workspace-manager";
import { buildPromptBundle } from "./prompt-builder";
import { runJudge } from "./judge-runner";
import { diagnoseRun } from "./diagnosis-engine";
import {
  getExperimentRead,
  getEvaluationRunRecordOrThrow,
  markEvaluationRun,
  refreshExperiment,
  settleCancelledRun,
} from "./experiment-service";
import { resolveStrategyBundleByVariant } from "./strategy-resolver";
import { buildSkillObservations } from "./skill-telemetry";
import { writeRunArtifacts } from "./writer";
import { createHash } from "node:crypto";

function buildReplicaSeed(experimentId: string, caseId: string, replicaIndex: number): number {
  // Replicas intentionally derive deterministic seeds from experiment/case/replica so baseline and
  // comparison variants can be paired against the same randomness budget during fine-tuning runs.
  const digest = createHash("sha256")
    .update(`${experimentId}:${caseId}:${replicaIndex}`)
    .digest("hex")
    .slice(0, 8);
  return Number.parseInt(digest, 16);
}

async function assertNotCancelled(runId: string): Promise<void> {
  if (await isEvaluationRunCancellationRequested(runId)) {
    throw new RunCancelledError("Cancellation requested by user.");
  }
}

export async function processEvaluationRun(runId: string): Promise<void> {
  const run = await getEvaluationRunRecordOrThrow(runId);
  const experiment = await getExperimentRead(run.experimentId);
  const caseDefinition = getCase(run.caseId);
  const variant = getVariant(run.variantId);
  const baselineVariant = getVariant(experiment.baseline_variant_id);
  const strategy = resolveStrategyBundleByVariant(variant, baselineVariant);
  const runStartedAt = run.startedAt ?? new Date();
  const replicaIndex = run.replicaIndex ?? 1;
  const replicaSeed = buildReplicaSeed(run.experimentId, caseDefinition.id, replicaIndex);

  await markEvaluationRun(run.id, {
    status: "preparing_workspace",
    lockedBy: `worker-${process.pid}`,
    startedAt: runStartedAt,
    finishedAt: null,
  });
  await refreshExperiment(run.experimentId);

  const workspace = prepareWorkspace(run.id, caseDefinition);
  try {
    await assertNotCancelled(run.id);
    await markEvaluationRun(run.id, { status: "building_prompt" });
    const promptBundle = buildPromptBundle(caseDefinition, strategy);

    await assertNotCancelled(run.id);
    await markEvaluationRun(run.id, { status: "running_agent" });
    const executorResult =
      settings.evaluationExecutorBackend === "runtime" && settings.llmApiKey
        ? await runRuntimeExecutor(caseDefinition, strategy, promptBundle, workspace.workspacePath)
        : createMockExecutorResult(caseDefinition, strategy, promptBundle, workspace);

    await assertNotCancelled(run.id);
    await markEvaluationRun(run.id, { status: "judging" });
    const judgeResult = runJudge(caseDefinition, workspace, executorResult);
    const diagnosis = diagnoseRun(caseDefinition, promptBundle, executorResult, judgeResult);
    const runFinishedAt = new Date();

    await storeRunTrace(run.id, executorResult.trace as Record<string, unknown>[]);
    const resultRecord = {
      run_id: run.id,
      case_id: caseDefinition.id,
      variant_id: variant.id,
      replica_index: replicaIndex,
      project: caseDefinition.project,
      mode: experiment.mode,
      success: judgeResult.success,
      status: "completed",
      seed: replicaSeed,
      strategy_snapshot: {
        variant_id: strategy.variant_id,
        kind: strategy.kind,
        changed_axis: strategy.changed_axis,
        prompt_version: strategy.prompt_version,
        model_profile: strategy.model_profile,
        business_context_profile: strategy.business_context_profile,
        session_context_policy: strategy.session_context_policy,
        mcp_profile: strategy.mcp_profile,
        sandbox_profile: strategy.sandbox_profile,
        context_packages: strategy.context_packages,
        fingerprint: strategy.fingerprint,
      },
      runtime_context_snapshot: executorResult.runtime_context_snapshot,
      configured_packages: promptBundle.configured_packages,
      loaded_packages: promptBundle.loaded_packages,
      // Skill observations are kept separate from raw package observations so the report layer can
      // explain three different states clearly: configured, loaded, and truly hit/activated.
      skill_observations: buildSkillObservations(promptBundle, executorResult),
      // Package observations are mode-aware telemetry. In strategy mode this will be empty; in
      // business fine-tuning mode it captures the configured/loaded/read/activated evidence chain.
      package_observations: executorResult.package_observations,
      failure_bucket: judgeResult.success ? [] : diagnosis.failure_bucket,
      suspected_gap: judgeResult.success ? [] : diagnosis.suspected_gap,
      suspected_root_cause: judgeResult.success ? [] : diagnosis.suspected_root_cause,
      diagnosis_reason: judgeResult.success ? [] : diagnosis.diagnosis_reason,
      recommended_action: judgeResult.success ? [] : diagnosis.recommended_action,
      summary: {
        final_message: executorResult.final_message,
        changed_files: judgeResult.scope_audit.changed_files,
        validations_run: executorResult.validations_run,
      },
      judge: judgeResult,
      metrics: {
        ...executorResult.metrics,
        judge_score: judgeResult.success ? 1 : 0,
      },
      timestamps: {
        started_at: runStartedAt.toISOString(),
        finished_at: runFinishedAt.toISOString(),
      },
    };

    await markEvaluationRun(run.id, { status: "writing_artifacts" });
    const artifactPaths = await writeRunArtifacts(run.id, {
      systemPromptSnapshot: executorResult.system_prompt_snapshot,
      runtimeContextSnapshot: executorResult.runtime_context_snapshot,
      trace: executorResult.trace as Record<string, unknown>[],
      judgeResult,
      resultRecord,
      summaryText: [
        `Run: ${run.id}`,
        `Case: ${caseDefinition.id}`,
        `Variant: ${variant.id}`,
        `Replica: ${replicaIndex}`,
        `Success: ${judgeResult.success}`,
        `Failure bucket: ${(judgeResult.success ? [] : diagnosis.failure_bucket).join(", ") || "none"}`,
        `Root cause: ${(judgeResult.success ? [] : diagnosis.suspected_root_cause).join(", ") || "none"}`,
        `Suspected gap: ${(judgeResult.success ? [] : diagnosis.suspected_gap).join(", ") || "none"}`,
      ].join("\n"),
      diffWriter: () => exportWorkspaceDiff(workspace, buildRunArtifactPaths(run.id).diff_file),
    });

    await markEvaluationRun(run.id, {
      status: "completed",
      metrics: resultRecord.metrics,
      judgePayload: judgeResult as unknown as Record<string, unknown>,
      failureTaxonomy: judgeResult.success ? [] : diagnosis.failure_bucket,
      artifactPaths,
      resultPayload: resultRecord,
      errorMessage: null,
      lockedBy: null,
      startedAt: runStartedAt,
      finishedAt: runFinishedAt,
    });
    await clearEvaluationRunCancellation(run.id);
    await refreshExperiment(run.experimentId);
  } catch (error) {
    if (error instanceof RunCancelledError) {
      await settleCancelledRun(run.id, error.message);
      return;
    }
    await markEvaluationRun(run.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.stack ?? error.message : String(error),
      lockedBy: null,
      startedAt: runStartedAt,
      finishedAt: new Date(),
    });
    await refreshExperiment(run.experimentId);
  } finally {
    try {
      exportWorkspaceDiff(workspace, buildRunArtifactPaths(run.id).diff_file);
    } catch {
      // ignore diff export failure on cleanup
    }
    cleanupWorkspace(workspace);
  }
}
