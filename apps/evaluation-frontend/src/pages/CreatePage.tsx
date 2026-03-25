import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import {
  useExperimentCreateStore,
} from "@/features/experiment-create/model/store";
import { ExperimentCreateForm } from "@/features/experiment-create/ui/ExperimentCreateForm";
import { formatChangedAxis, formatContextMode, formatDifficulty, formatMode, formatTuningAxis } from "@/shared/lib/format";
import { AppFrame } from "@/shared/ui/AppFrame";
import { TermLabel } from "@/shared/ui/TermLabel";

export default function CreatePage() {
  const navigate = useNavigate();
  const bootstrap = useExperimentCreateStore((state) => state.bootstrap);
  const submitExperiment = useExperimentCreateStore((state) => state.submit);
  const setField = useExperimentCreateStore((state) => state.setField);
  const loading = useExperimentCreateStore((state) => state.loading);
  const submitting = useExperimentCreateStore((state) => state.submitting);
  const error = useExperimentCreateStore((state) => state.error);
  const cases = useExperimentCreateStore((state) => state.cases);
  const variants = useExperimentCreateStore((state) => state.variants);
  const payload = useExperimentCreateStore((state) => state.payload);

  const matrixSize = useMemo(
    () =>
      payload.case_ids.length *
      (1 + payload.comparison_variant_ids.length) *
      Math.max(1, payload.replica_count ?? 1),
    [payload.case_ids, payload.comparison_variant_ids, payload.replica_count],
  );
  const validationIssues = useMemo(() => {
    const issues: string[] = [];
    if (!payload.name.trim()) {
      issues.push("必须填写实验名称。");
    }
    if (payload.case_ids.length === 0) {
      issues.push("至少选择一个 Case。");
    }
    if (!payload.baseline_variant_id) {
      issues.push("必须选择一个 Baseline。");
    }
    if (payload.comparison_variant_ids.length === 0) {
      issues.push("至少选择一个 Variant。");
    }
    if ((payload.replica_count ?? 0) < 1) {
      issues.push("Replica 必须大于等于 1。");
    }
    const expectedBaselineId =
      payload.mode === "business_fine_tuning" ? "ft-baseline-v1" : "baseline-v1";
    if (payload.baseline_variant_id !== expectedBaselineId) {
      issues.push(`当前 ${formatMode(payload.mode ?? "strategy")} 模式请使用 ${expectedBaselineId} 作为 Baseline。`);
    }
    if (payload.comparison_variant_ids.includes(payload.baseline_variant_id)) {
      issues.push("对照变体不能包含基线变体本身。");
    }
    const invalidComparisons = variants
      .filter((variant) => variant.kind === (payload.mode ?? "strategy"))
      .filter((variant) => payload.comparison_variant_ids.includes(variant.id))
      .filter((variant) => variant.changed_axis === "baseline" || !variant.changed_axis);
    if (invalidComparisons.length > 0) {
      issues.push(`以下对照变体无法识别单变量轴：${invalidComparisons.map((item) => item.id).join("，")}`);
    }
    const mixedKinds = variants
      .filter((variant) =>
        [payload.baseline_variant_id, ...payload.comparison_variant_ids].includes(variant.id),
      )
      .filter((variant) => variant.kind !== (payload.mode ?? "strategy"));
    if (mixedKinds.length > 0) {
      issues.push(`以下变体与当前实验模式不匹配：${mixedKinds.map((item) => item.id).join("，")}`);
    }
    return issues;
  }, [payload, variants]);
  const caseOptions = useMemo(
    () =>
      cases.map((item) => ({
        label: `${item.id} · ${formatTuningAxis(item.tuning_axis)} · ${formatDifficulty(item.difficulty)} · ${formatContextMode(item.context_mode)}`,
        value: item.id,
      })),
    [cases],
  );
  const baselineOptions = useMemo(
    () =>
      variants
        .filter((variant) => variant.kind === (payload.mode ?? "strategy"))
        .map((variant) => ({
          label: `${variant.id} · ${formatChangedAxis(variant.changed_axis)}`,
          value: variant.id,
        })),
    [payload.mode, variants],
  );
  const comparisonOptions = useMemo(
    () =>
      variants
        .filter((variant) => variant.kind === (payload.mode ?? "strategy"))
        .filter((variant) => variant.id !== payload.baseline_variant_id)
        .map((variant) => ({
          label:
            variant.kind === "business_fine_tuning"
              ? `${variant.id} · ${formatChangedAxis(variant.changed_axis)} · Packages:${variant.package_refs.join(", ")}`
              : `${variant.id} · ${formatChangedAxis(variant.changed_axis)} · Prompt:${variant.prompt_version} · Model:${variant.model_profile} · Business Context:${variant.business_context_profile} · Session Context:${variant.session_context_policy}`,
          value: variant.id,
        })),
    [payload.baseline_variant_id, payload.mode, variants],
  );

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const submit = async (runAfterCreate = false) => {
    const experimentId = await submitExperiment({ runAfterCreate });
    if (experimentId) {
      navigate(`/experiments/${experimentId}`);
    }
  };

  return (
    <AppFrame
      title={<TermLabel termKey="page.create_experiment" />}
      subtitle={
        <>
          选择 <TermLabel termKey="field.case" /> 与 <TermLabel termKey="field.variant" /> 组合，生成
          <TermLabel termKey="section.run_matrix" />。可以先创建，再决定是否立即开始运行。
        </>
      }
    >
      <ExperimentCreateForm
        loading={loading}
        submitting={submitting}
        error={error}
        matrixSize={matrixSize}
        validationIssues={validationIssues}
        payload={payload}
        caseOptions={caseOptions}
        baselineOptions={baselineOptions}
        comparisonOptions={comparisonOptions}
        onNameChange={(value) => setField("name", value)}
        onModeChange={(value) => setField("mode", value)}
        onReplicaCountChange={(value) => setField("replica_count", value)}
        onCaseIdsChange={(value) => setField("case_ids", value)}
        onBaselineChange={(value) => setField("baseline_variant_id", value)}
        onComparisonChange={(value) => setField("comparison_variant_ids", value)}
        onCreateOnly={async () => {
          await submit(false);
        }}
        onCreateAndRun={async () => {
          await submit(true);
        }}
      />
    </AppFrame>
  );
}
