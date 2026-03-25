import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  listCases: vi.fn(),
  listVariants: vi.fn(),
  createExperiment: vi.fn(),
  startExperiment: vi.fn(),
  listExperiments: vi.fn(),
  getExperiment: vi.fn(),
  getRunTraceEvents: vi.fn(),
  startRun: vi.fn(),
  rerunRun: vi.fn(),
  cancelRun: vi.fn(),
}));

vi.mock("@/shared/api/evaluation-client", () => apiMocks);

describe("evaluation frontend zustand stores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a queued experiment from the history store", async () => {
    apiMocks.listExperiments.mockResolvedValueOnce([
      {
        id: "exp-1",
        name: "smoke",
        status: "queued",
        case_count: 1,
        variant_count: 2,
        total_runs: 2,
        completed_runs: 0,
        failed_runs: 0,
        overall_success_rate: 0,
        created_at: "2026-03-23T00:00:00.000Z",
        updated_at: "2026-03-23T00:00:00.000Z",
      },
    ]);
    apiMocks.startExperiment.mockResolvedValueOnce({ id: "exp-1", started: true, status: "running" });

    vi.resetModules();
    const { useExperimentHistoryStore } = await import("../src/features/experiment-history/model/store");

    await useExperimentHistoryStore.getState().load();
    const started = await useExperimentHistoryStore.getState().start("exp-1");

    expect(started).toBe(true);
    expect(useExperimentHistoryStore.getState().experiments[0]?.status).toBe("running");
    useExperimentHistoryStore.getState().dispose();
  });

  it("bootstraps and submits the create store", async () => {
    apiMocks.listCases.mockResolvedValueOnce([
      {
        id: "case-1",
        name: "Fix bug",
        project: "demo",
        task_family: "checkout-tracking",
        tuning_axis: "prompt",
        difficulty: "simple",
        context_mode: "structured_task_card",
        source_path: "cases/case-1.yaml",
      },
    ]);
    apiMocks.listVariants.mockResolvedValueOnce([
      {
        kind: "strategy",
        id: "baseline-v1",
        description: "baseline",
        changed_axis: "baseline",
        prompt_version: "base-v1",
        model_profile: "gpt-5-medium",
        business_context_profile: "frontend-domain-v1",
        session_context_policy: "session-basic-v1",
        package_refs: [],
        source_path: "baseline-v1.yaml",
      },
      {
        kind: "strategy",
        id: "prompt-v2",
        description: "prompt",
        changed_axis: "prompt",
        prompt_version: "task-card-v2",
        model_profile: "gpt-5-medium",
        business_context_profile: "frontend-domain-v1",
        session_context_policy: "session-basic-v1",
        package_refs: [],
        source_path: "prompt-v2.yaml",
      },
      {
        kind: "business_fine_tuning",
        id: "ft-baseline-v1",
        description: "fine tuning baseline",
        changed_axis: "baseline",
        prompt_version: "base-v1",
        model_profile: "gpt-5-medium",
        business_context_profile: "frontend-domain-v1",
        session_context_policy: "session-basic-v1",
        package_refs: [
          "repo-policy/frontend-base@1.0.0",
          "skill/repo-guide@1.0.0",
          "skill/finish-checklist@1.0.0",
        ],
        source_path: "ft-baseline-v1.yaml",
      },
      {
        kind: "business_fine_tuning",
        id: "ft-button-skill-v2",
        description: "fine tuning comparison",
        changed_axis: "context_packages",
        prompt_version: "base-v1",
        model_profile: "gpt-5-medium",
        business_context_profile: "frontend-domain-v1",
        session_context_policy: "session-basic-v1",
        package_refs: [
          "repo-policy/frontend-base@1.0.0",
          "skill/repo-guide@1.0.0",
          "skill/button-usage@2.0.0",
          "skill/finish-checklist@1.0.0",
        ],
        source_path: "ft-button-skill-v2.yaml",
      },
    ]);
    apiMocks.createExperiment.mockResolvedValueOnce({ id: "exp-2", status: "queued" });
    apiMocks.startExperiment.mockResolvedValueOnce({ id: "exp-2", started: true, status: "running" });

    vi.resetModules();
    const { useExperimentCreateStore } = await import("../src/features/experiment-create/model/store");

    await useExperimentCreateStore.getState().bootstrap();
    const experimentId = await useExperimentCreateStore.getState().submit({ runAfterCreate: true });

    expect(experimentId).toBe("exp-2");
    expect(useExperimentCreateStore.getState().payload.case_ids).toEqual(["case-1"]);
    expect(useExperimentCreateStore.getState().payload.baseline_variant_id).toBe("baseline-v1");
  });

  it("switches the create store into business fine-tuning mode", async () => {
    apiMocks.listCases.mockResolvedValueOnce([
      {
        id: "case-1",
        name: "Fix bug",
        project: "demo",
        task_family: "checkout-tracking",
        tuning_axis: "skills",
        difficulty: "simple",
        context_mode: "repo_context+skill_notes",
        source_path: "cases/case-1.yaml",
      },
    ]);
    apiMocks.listVariants.mockResolvedValueOnce([
      {
        kind: "strategy",
        id: "baseline-v1",
        description: "baseline",
        changed_axis: "baseline",
        prompt_version: "base-v1",
        model_profile: "gpt-5-medium",
        business_context_profile: "frontend-domain-v1",
        session_context_policy: "session-basic-v1",
        package_refs: [],
        source_path: "baseline-v1.yaml",
      },
      {
        kind: "business_fine_tuning",
        id: "ft-baseline-v1",
        description: "fine tuning baseline",
        changed_axis: "baseline",
        prompt_version: "base-v1",
        model_profile: "gpt-5-medium",
        business_context_profile: "frontend-domain-v1",
        session_context_policy: "session-basic-v1",
        package_refs: [
          "repo-policy/frontend-base@1.0.0",
          "skill/repo-guide@1.0.0",
          "skill/finish-checklist@1.0.0",
        ],
        source_path: "ft-baseline-v1.yaml",
      },
      {
        kind: "business_fine_tuning",
        id: "ft-button-skill-v2",
        description: "fine tuning comparison",
        changed_axis: "context_packages",
        prompt_version: "base-v1",
        model_profile: "gpt-5-medium",
        business_context_profile: "frontend-domain-v1",
        session_context_policy: "session-basic-v1",
        package_refs: [
          "repo-policy/frontend-base@1.0.0",
          "skill/repo-guide@1.0.0",
          "skill/button-usage@2.0.0",
          "skill/finish-checklist@1.0.0",
        ],
        source_path: "ft-button-skill-v2.yaml",
      },
    ]);

    vi.resetModules();
    const { useExperimentCreateStore } = await import("../src/features/experiment-create/model/store");

    await useExperimentCreateStore.getState().bootstrap();
    useExperimentCreateStore.getState().setField("mode", "business_fine_tuning");

    expect(useExperimentCreateStore.getState().payload.mode).toBe("business_fine_tuning");
    expect(useExperimentCreateStore.getState().payload.replica_count).toBe(3);
    expect(useExperimentCreateStore.getState().payload.baseline_variant_id).toBe("ft-baseline-v1");
    expect(useExperimentCreateStore.getState().payload.comparison_variant_ids).toEqual([
      "ft-button-skill-v2",
    ]);
  });

  it("loads detail state and applies experiment start transitions", async () => {
    apiMocks.getExperiment.mockResolvedValueOnce({
      id: "exp-3",
      name: "detail",
      mode: "strategy",
      status: "queued",
      replica_count: 1,
      case_ids: ["case-1"],
      baseline_variant_id: "baseline-v1",
      comparison_variant_ids: ["prompt-v2"],
      total_runs: 1,
      completed_runs: 0,
      failed_runs: 0,
      aggregate_payload: {
        design_snapshot: {
          baseline_variant_id: "baseline-v1",
          comparison_variant_ids: ["prompt-v2"],
          changed_axes: { "prompt-v2": "prompt" },
          cases: [],
          variants: [],
        },
      },
      report_paths: {},
      runs: [
        {
          id: "run-1",
          experiment_id: "exp-3",
          replica_index: 1,
          case_id: "case-1",
          variant_id: "baseline-v1",
          status: "queued",
          metrics: {},
          judge_payload: {},
          failure_bucket: [],
          suspected_gap: [],
          suspected_root_cause: [],
          strategy_snapshot: {},
          artifact_paths: {},
          result_payload: {},
          error_message: null,
          created_at: "2026-03-23T00:00:00.000Z",
          updated_at: "2026-03-23T00:00:00.000Z",
          started_at: null,
          finished_at: null,
        },
      ],
      created_at: "2026-03-23T00:00:00.000Z",
      updated_at: "2026-03-23T00:00:00.000Z",
      started_at: null,
      finished_at: null,
    });
    apiMocks.getRunTraceEvents.mockRejectedValueOnce(new Error("Trace file for run run-1 not found"));
    apiMocks.startExperiment.mockResolvedValueOnce({ id: "exp-3", started: true, status: "running" });

    vi.resetModules();
    const { useExperimentDetailStore } = await import("../src/features/experiment-detail/model/store");

    await useExperimentDetailStore.getState().load("exp-3");
    const started = await useExperimentDetailStore.getState().startExperiment();

    expect(started).toBe(true);
    expect(useExperimentDetailStore.getState().experiment?.status).toBe("running");
    expect(useExperimentDetailStore.getState().experiment?.runs[0]?.status).toBe("preparing_workspace");
    useExperimentDetailStore.getState().dispose();
  });
});
