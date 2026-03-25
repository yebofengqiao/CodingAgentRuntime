import { create } from "zustand";

import {
  cancelRun as cancelRunRequest,
  getExperiment,
  getRunTraceEvents,
  rerunRun as rerunRunRequest,
  startExperiment as startExperimentRequest,
  startRun as startRunRequest,
} from "@/shared/api/evaluation-client";
import type { ExperimentRead, RunRead, RunTraceRead, VariantAggregateSummary } from "@/shared/types/evaluation";

const ACTIVE_RUN_STATUSES = new Set([
  "running",
  "preparing_workspace",
  "building_prompt",
  "running_agent",
  "judging",
  "writing_artifacts",
  "cancelling",
]);

type ExperimentDetailState = {
  experiment: ExperimentRead | null;
  selectedRunId: string | null;
  trace: RunTraceRead | null;
  loading: boolean;
  traceLoading: boolean;
  starting: boolean;
  activeRunActionId: string | null;
  error: string | null;
  traceError: string | null;
  traceMissing: boolean;
  activeExperimentId: string | null;
  load: (experimentId: string, options?: { silent?: boolean }) => Promise<void>;
  selectRun: (runId: string) => Promise<void>;
  loadTrace: (runId: string, options?: { silent?: boolean }) => Promise<void>;
  startExperiment: () => Promise<boolean>;
  startRun: (runId: string) => Promise<boolean>;
  rerunRun: (runId: string) => Promise<boolean>;
  cancelRun: (runId: string) => Promise<boolean>;
  dispose: () => void;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (refreshTimer != null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function resolveSelectedRunId(
  experiment: ExperimentRead,
  currentSelectedRunId: string | null,
): string | null {
  if (experiment.runs.length === 0) {
    return null;
  }
  if (currentSelectedRunId != null && experiment.runs.some((item) => item.id === currentSelectedRunId)) {
    return currentSelectedRunId;
  }
  const runningRun = experiment.runs.find((item) => ACTIVE_RUN_STATUSES.has(item.status));
  return runningRun?.id ?? experiment.runs[0].id;
}

function scheduleRefresh(delayMs = 500) {
  const { activeExperimentId } = useExperimentDetailStore.getState();
  if (activeExperimentId == null) {
    return;
  }
  if (refreshTimer != null) {
    clearTimeout(refreshTimer);
  }
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const nextExperimentId = useExperimentDetailStore.getState().activeExperimentId;
    if (nextExperimentId != null) {
      void useExperimentDetailStore.getState().load(nextExperimentId, { silent: true });
    }
  }, delayMs);
}

function syncPolling() {
  const { experiment, activeExperimentId } = useExperimentDetailStore.getState();
  const shouldPoll =
    experiment != null &&
    (experiment.status === "queued" || experiment.status === "running") &&
    activeExperimentId != null;

  if (!shouldPoll) {
    clearTimers();
    return;
  }

  if (pollTimer != null) {
    return;
  }

  pollTimer = setInterval(() => {
    const nextExperimentId = useExperimentDetailStore.getState().activeExperimentId;
    if (nextExperimentId != null) {
      void useExperimentDetailStore.getState().load(nextExperimentId, { silent: true });
    }
  }, 3000);
}

function applyExperimentStart(state: ExperimentDetailState) {
  if (state.experiment == null) {
    return {};
  }

  const firstQueuedRun = state.experiment.runs.find((item) => item.status === "queued");
  const now = new Date().toISOString();
  const runs = state.experiment.runs.map((item) =>
    item.id === firstQueuedRun?.id
      ? {
          ...item,
          status: "preparing_workspace",
          started_at: item.started_at ?? now,
          finished_at: null,
          updated_at: now,
        }
      : item,
  );

  return {
    experiment: {
      ...state.experiment,
      status: "running",
      runs,
      started_at: state.experiment.started_at ?? now,
      finished_at: null,
      updated_at: now,
    },
    selectedRunId: firstQueuedRun?.id ?? state.selectedRunId,
    trace: null,
    traceLoading: false,
    traceError: null,
    traceMissing: true,
  };
}

function applyRunTransition(
  state: ExperimentDetailState,
  runId: string,
  status: string,
  options?: { resetArtifacts?: boolean },
) {
  if (state.experiment == null) {
    return {};
  }

  const now = new Date().toISOString();
  const runs = state.experiment.runs.map((item) =>
    item.id === runId
      ? {
          ...item,
          status,
          failure_bucket: options?.resetArtifacts ? [] : item.failure_bucket,
          suspected_gap: options?.resetArtifacts ? [] : item.suspected_gap,
          strategy_snapshot: options?.resetArtifacts ? {} : item.strategy_snapshot,
          artifact_paths: options?.resetArtifacts ? {} : item.artifact_paths,
          result_payload: options?.resetArtifacts ? {} : item.result_payload,
          error_message: null,
          started_at: item.started_at ?? now,
          finished_at: null,
          updated_at: now,
        }
      : item,
  );

  return {
    experiment: {
      ...state.experiment,
      status: "running",
      runs,
      aggregate_payload: {
        design_snapshot:
          (state.experiment.aggregate_payload as { design_snapshot?: Record<string, unknown> })
            .design_snapshot ?? {},
      },
      report_paths: {},
      completed_runs: runs.filter((item) => item.status === "completed").length,
      failed_runs: runs.filter((item) => item.status === "failed" || item.status === "cancelled").length,
      started_at: state.experiment.started_at ?? now,
      finished_at: null,
      updated_at: now,
    },
    trace: null,
    traceLoading: false,
    traceError: null,
    traceMissing: true,
  };
}

function applyRunCancelled(state: ExperimentDetailState, runId: string, status: string) {
  if (state.experiment == null) {
    return {};
  }

  const now = new Date().toISOString();
  const runs = state.experiment.runs.map((item) =>
    item.id === runId
      ? {
          ...item,
          status,
          error_message: "Cancelled by user.",
          finished_at: status === "cancelled" ? now : item.finished_at,
          updated_at: now,
        }
      : item,
  );
  const hasActiveRuns = runs.some((item) => ACTIVE_RUN_STATUSES.has(item.status));
  const hasQueuedRuns = runs.some((item) => item.status === "queued");

  return {
    experiment: {
      ...state.experiment,
      status: hasActiveRuns ? "running" : hasQueuedRuns ? "queued" : "failed",
      runs,
      failed_runs: runs.filter((item) => item.status === "failed" || item.status === "cancelled").length,
      finished_at: hasActiveRuns || hasQueuedRuns ? null : now,
      updated_at: now,
    },
    traceLoading: status === "cancelled" ? false : state.traceLoading,
  };
}

export const useExperimentDetailStore = create<ExperimentDetailState>((set, get) => ({
  experiment: null,
  selectedRunId: null,
  trace: null,
  loading: true,
  traceLoading: false,
  starting: false,
  activeRunActionId: null,
  error: null,
  traceError: null,
  traceMissing: false,
  activeExperimentId: null,

  load: async (experimentId, options) => {
    set((state) => ({
      activeExperimentId: experimentId,
      loading: !options?.silent || state.experiment == null,
      error: null,
    }));

    try {
      const experiment = await getExperiment(experimentId);
      const selectedRunId = resolveSelectedRunId(experiment, get().selectedRunId);
      set({
        experiment,
        selectedRunId,
        loading: false,
      });

      if (selectedRunId) {
        await get().loadTrace(selectedRunId, { silent: true });
      } else {
        set({
          trace: null,
          traceError: null,
          traceLoading: false,
          traceMissing: false,
        });
      }
      syncPolling();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      });
    }
  },

  selectRun: async (runId) => {
    set({ selectedRunId: runId });
    await get().loadTrace(runId);
  },

  loadTrace: async (runId, options) => {
    set((state) => ({
      traceLoading: !options?.silent || state.trace == null || state.trace.run_id !== runId,
      traceError: null,
      traceMissing: false,
    }));

    try {
      const trace = await getRunTraceEvents(runId);
      set({
        trace,
        traceLoading: false,
        traceMissing: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Trace file for run")) {
        set({
          trace: null,
          traceError: null,
          traceLoading: false,
          traceMissing: true,
        });
        return;
      }

      set({
        traceLoading: false,
        traceError: message,
      });
    }
  },

  startExperiment: async () => {
    const { activeExperimentId } = get();
    if (activeExperimentId == null) {
      return false;
    }

    set({
      starting: true,
      error: null,
    });
    try {
      await startExperimentRequest(activeExperimentId);
      set((state) => ({
        ...applyExperimentStart(state),
        starting: false,
      }));
      syncPolling();
      scheduleRefresh();
      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        starting: false,
      });
      return false;
    }
  },

  startRun: async (runId) => {
    set({
      activeRunActionId: runId,
      selectedRunId: runId,
      error: null,
    });
    try {
      await startRunRequest(runId);
      set((state) => ({
        ...applyRunTransition(state, runId, "preparing_workspace"),
        activeRunActionId: null,
      }));
      syncPolling();
      scheduleRefresh();
      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        activeRunActionId: null,
      });
      return false;
    }
  },

  rerunRun: async (runId) => {
    set({
      activeRunActionId: runId,
      selectedRunId: runId,
      trace: null,
      traceError: null,
      traceMissing: true,
      error: null,
    });
    try {
      await rerunRunRequest(runId);
      set((state) => ({
        ...applyRunTransition(state, runId, "preparing_workspace", { resetArtifacts: true }),
        activeRunActionId: null,
      }));
      syncPolling();
      scheduleRefresh();
      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        activeRunActionId: null,
      });
      return false;
    }
  },

  cancelRun: async (runId) => {
    set({
      activeRunActionId: runId,
      selectedRunId: runId,
      error: null,
    });
    try {
      const response = await cancelRunRequest(runId);
      set((state) => ({
        ...applyRunCancelled(state, runId, response.status),
        activeRunActionId: null,
      }));
      syncPolling();
      scheduleRefresh();
      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        activeRunActionId: null,
      });
      return false;
    }
  },

  dispose: () => {
    clearTimers();
  },
}));

export function selectSelectedRun(state: ExperimentDetailState): RunRead | null {
  if (state.experiment == null || state.selectedRunId == null) {
    return null;
  }
  return state.experiment.runs.find((item) => item.id === state.selectedRunId) ?? null;
}

export function selectVariantRows(state: ExperimentDetailState) {
  const payload = (state.experiment?.aggregate_payload ?? {}) as {
    variant_summaries?: VariantAggregateSummary[];
  };
  return payload.variant_summaries ?? [];
}

export function selectRunOptions(state: ExperimentDetailState) {
  return (state.experiment?.runs ?? []).map((run) => ({
    label: `${run.case_id} · ${run.variant_id} · ${run.status}`,
    value: run.id,
  }));
}
