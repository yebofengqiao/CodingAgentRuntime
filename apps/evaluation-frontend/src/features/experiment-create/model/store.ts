import { create } from "zustand";

import { createExperiment, listCases, listVariants, startExperiment } from "@/shared/api/evaluation-client";
import { formatChangedAxis, formatContextMode, formatDifficulty, formatMode, formatTuningAxis } from "@/shared/lib/format";
import type {
  CatalogCaseSummary,
  CatalogVariantSummary,
  ExperimentCreatePayload,
} from "@/shared/types/evaluation";

type ExperimentCreateState = {
  cases: CatalogCaseSummary[];
  variants: CatalogVariantSummary[];
  payload: ExperimentCreatePayload;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  bootstrap: () => Promise<void>;
  setField: <K extends keyof ExperimentCreatePayload>(
    key: K,
    value: ExperimentCreatePayload[K],
  ) => void;
  submit: (options?: { runAfterCreate?: boolean }) => Promise<string | null>;
};

function selectBaselineId(
  variants: CatalogVariantSummary[],
  mode: ExperimentCreatePayload["mode"],
): string {
  const scopedVariants = variants.filter((item) => item.kind === mode);
  return mode === "business_fine_tuning"
    ? (scopedVariants.find((item) => item.id === "ft-baseline-v1")?.id ?? scopedVariants[0]?.id ?? "")
    : (scopedVariants.find((item) => item.id === "baseline-v1")?.id ?? scopedVariants[0]?.id ?? "");
}

function selectScopedComparisonIds(
  variants: CatalogVariantSummary[],
  mode: ExperimentCreatePayload["mode"],
  baselineId: string,
): string[] {
  return variants
    .filter((item) => item.kind === mode)
    .map((item) => item.id)
    .filter((item) => item !== baselineId)
    .slice(0, 5);
}

export const useExperimentCreateStore = create<ExperimentCreateState>((set, get) => ({
  cases: [],
  variants: [],
  payload: {
    name: "frontend-eval-batch",
    mode: "strategy",
    replica_count: 1,
    case_ids: [],
    baseline_variant_id: "baseline-v1",
    comparison_variant_ids: [],
  },
  loading: true,
  submitting: false,
  error: null,

  bootstrap: async () => {
    set({
      loading: true,
      error: null,
    });

    try {
      const [cases, variants] = await Promise.all([listCases(), listVariants()]);
      set((state) => {
        const mode = state.payload.mode ?? "strategy";
        const baselineId = selectBaselineId(variants, mode);
        return {
          cases,
          variants,
          payload: {
          ...state.payload,
            mode,
            replica_count: mode === "business_fine_tuning" ? 3 : 1,
            case_ids: cases.slice(0, 4).map((item) => item.id),
            baseline_variant_id: baselineId,
            comparison_variant_ids: selectScopedComparisonIds(variants, mode, baselineId),
          },
          loading: false,
        };
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      });
    }
  },

  setField: (key, value) => {
    set((state) => {
      const nextPayload = {
        ...state.payload,
        [key]: value,
      };

      if (key === "baseline_variant_id") {
        nextPayload.comparison_variant_ids = nextPayload.comparison_variant_ids.filter(
          (item) => item !== value,
        );
      }

      if (key === "mode") {
        const mode = value as ExperimentCreatePayload["mode"];
        const baselineId = selectBaselineId(state.variants, mode);
        nextPayload.baseline_variant_id = baselineId;
        nextPayload.comparison_variant_ids = selectScopedComparisonIds(
          state.variants,
          mode,
          baselineId,
        );
        nextPayload.replica_count = mode === "business_fine_tuning" ? 3 : 1;
      }

      return {
        payload: nextPayload,
      };
    });
  },

  submit: async (options) => {
    if (selectValidationIssues(get()).length > 0) {
      return null;
    }

    set({
      submitting: true,
      error: null,
    });

    try {
      const response = await createExperiment(get().payload);
      if (options?.runAfterCreate) {
        await startExperiment(response.id);
      }
      set({ submitting: false });
      return response.id;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        submitting: false,
      });
      return null;
    }
  },
}));

export function selectBaselineOptions(state: ExperimentCreateState) {
  return state.variants
    .filter((variant) => variant.kind === (state.payload.mode ?? "strategy"))
    .map((variant) => ({
      label: `${variant.id} · ${formatChangedAxis(variant.changed_axis)}`,
      value: variant.id,
    }));
}

export function selectComparisonOptions(state: ExperimentCreateState) {
  return state.variants
    .filter((variant) => variant.kind === (state.payload.mode ?? "strategy"))
    .filter((variant) => variant.id !== state.payload.baseline_variant_id)
    .map((variant) => ({
      label:
        variant.kind === "business_fine_tuning"
          ? `${variant.id} · ${formatChangedAxis(variant.changed_axis)} · Packages:${variant.package_refs.join(", ")}`
          : `${variant.id} · ${formatChangedAxis(variant.changed_axis)} · Prompt:${variant.prompt_version} · Model:${variant.model_profile} · Business Context:${variant.business_context_profile} · Session Context:${variant.session_context_policy}`,
      value: variant.id,
    }));
}

export function selectCaseOptions(state: ExperimentCreateState) {
  return state.cases.map((item) => ({
    label: `${item.id} · ${formatTuningAxis(item.tuning_axis)} · ${formatDifficulty(item.difficulty)} · ${formatContextMode(item.context_mode)}`,
    value: item.id,
  }));
}

export function selectMatrixSize(state: ExperimentCreateState) {
  return (
    state.payload.case_ids.length *
    (1 + state.payload.comparison_variant_ids.length) *
    Math.max(1, state.payload.replica_count ?? 1)
  );
}

export function selectValidationIssues(state: ExperimentCreateState) {
  const issues: string[] = [];
  if (!state.payload.name.trim()) {
    issues.push("必须填写实验名称。");
  }
  if (state.payload.case_ids.length === 0) {
    issues.push("至少选择一个 Case。");
  }
  if (!state.payload.baseline_variant_id) {
    issues.push("必须选择一个 Baseline。");
  }
  if (state.payload.comparison_variant_ids.length === 0) {
    issues.push("至少选择一个 Variant。");
  }
  if ((state.payload.replica_count ?? 0) < 1) {
    issues.push("Replica 必须大于等于 1。");
  }
  if (
    state.payload.baseline_variant_id &&
    state.payload.comparison_variant_ids.includes(state.payload.baseline_variant_id)
  ) {
    issues.push("对照变体不能包含基线变体本身。");
  }
  const expectedBaselineId =
    state.payload.mode === "business_fine_tuning" ? "ft-baseline-v1" : "baseline-v1";
  if (state.payload.baseline_variant_id !== expectedBaselineId) {
    issues.push(`当前 ${formatMode(state.payload.mode ?? "strategy")} 模式请使用 ${expectedBaselineId} 作为 Baseline。`);
  }
  const invalidComparisons = state.variants
    .filter((variant) => state.payload.comparison_variant_ids.includes(variant.id))
    .filter((variant) => variant.kind === (state.payload.mode ?? "strategy"))
    .filter((variant) => variant.changed_axis === "baseline" || !variant.changed_axis);
  if (invalidComparisons.length > 0) {
    issues.push(`以下对照变体无法识别单变量轴：${invalidComparisons.map((item) => item.id).join("，")}`);
  }
  const mixedKinds = state.variants
    .filter((variant) =>
      [state.payload.baseline_variant_id, ...state.payload.comparison_variant_ids].includes(variant.id),
    )
    .filter((variant) => variant.kind !== (state.payload.mode ?? "strategy"));
  if (mixedKinds.length > 0) {
    issues.push(`以下变体与当前实验模式不匹配：${mixedKinds.map((item) => item.id).join("，")}`);
  }
  return issues;
}
