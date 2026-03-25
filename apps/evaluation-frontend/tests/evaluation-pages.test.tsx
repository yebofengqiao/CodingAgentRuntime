// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const createFormSpy = vi.hoisted(() => vi.fn());
const detailViewSpy = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/evaluation-client", () => apiMocks);

vi.mock("@/shared/ui/AppFrame", () => ({
  AppFrame: ({
    title,
    subtitle,
    children,
  }: {
    title: React.ReactNode;
    subtitle?: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="app-frame">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {children}
    </div>
  ),
}));

vi.mock("@/features/experiment-create/ui/ExperimentCreateForm", () => ({
  ExperimentCreateForm: (props: unknown) => {
    createFormSpy(props);
    return <div data-testid="create-form">create-form</div>;
  },
}));

vi.mock("@/features/experiment-detail/ui/ExperimentDetailView", () => ({
  ExperimentDetailView: (props: { experimentId: string }) => {
    detailViewSpy(props);
    return <div data-testid="detail-view">{props.experimentId}</div>;
  },
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("evaluation frontend pages", () => {
  it("renders CreatePage without retriggering bootstrap on every render", async () => {
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
    ]);

    vi.resetModules();
    const { default: CreatePage } = await import("../src/pages/CreatePage");

    render(
      <MemoryRouter initialEntries={["/create"]}>
        <CreatePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(apiMocks.listCases).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiMocks.listVariants).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("heading", { name: "Create Experiment" })).toBeTruthy();
    expect(screen.getByTestId("create-form")).toBeTruthy();
    expect(createFormSpy).toHaveBeenCalled();
  });

  it("renders ExperimentDetailRoute without retriggering load on every render", async () => {
    apiMocks.getExperiment.mockResolvedValueOnce({
      id: "exp-1",
      name: "detail",
      mode: "strategy",
      status: "completed",
      replica_count: 1,
      case_ids: ["case-1"],
      baseline_variant_id: "baseline-v1",
      comparison_variant_ids: ["prompt-v2"],
      total_runs: 1,
      completed_runs: 1,
      failed_runs: 0,
      aggregate_payload: {},
      report_paths: {},
      runs: [
        {
          id: "run-1",
          experiment_id: "exp-1",
          replica_index: 1,
          case_id: "case-1",
          variant_id: "baseline",
          status: "completed",
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
          started_at: "2026-03-23T00:00:00.000Z",
          finished_at: "2026-03-23T00:10:00.000Z",
        },
      ],
      created_at: "2026-03-23T00:00:00.000Z",
      updated_at: "2026-03-23T00:10:00.000Z",
      started_at: "2026-03-23T00:00:00.000Z",
      finished_at: "2026-03-23T00:10:00.000Z",
    });
    apiMocks.getRunTraceEvents.mockResolvedValueOnce({
      run_id: "run-1",
      events: [],
      derived: {
        used_tools: [],
        validations_run: [],
        final_message: "",
        finish_reason: "completed",
        tool_call_count: 0,
        parse_warnings: 0,
      },
    });

    vi.resetModules();
    const { default: ExperimentDetailRoute } = await import("../src/pages/ExperimentDetailRoute");

    render(
      <MemoryRouter initialEntries={["/experiments/exp-1"]}>
        <Routes>
          <Route path="/experiments/:experimentId" element={<ExperimentDetailRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(apiMocks.getExperiment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiMocks.getRunTraceEvents).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("heading", { name: "Experiment Detail" })).toBeTruthy();
    expect(screen.getByTestId("detail-view").textContent).toBe("exp-1");
    expect(detailViewSpy).toHaveBeenCalled();
  });
});
