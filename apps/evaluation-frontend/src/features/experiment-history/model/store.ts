import { create } from "zustand";

import { listExperiments, startExperiment } from "@/shared/api/evaluation-client";
import type { ExperimentListItem } from "@/shared/types/evaluation";

type ExperimentHistoryState = {
  experiments: ExperimentListItem[];
  startingExperimentId: string | null;
  loading: boolean;
  error: string | null;
  load: (options?: { silent?: boolean }) => Promise<void>;
  start: (experimentId: string) => Promise<boolean>;
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

function syncPolling() {
  const shouldPoll = useExperimentHistoryStore
    .getState()
    .experiments.some((item) => item.status === "queued" || item.status === "running");

  if (!shouldPoll) {
    clearTimers();
    return;
  }

  if (pollTimer != null) {
    return;
  }

  pollTimer = setInterval(() => {
    void useExperimentHistoryStore.getState().load({ silent: true });
  }, 3000);
}

function scheduleRefresh(delayMs = 500) {
  if (refreshTimer != null) {
    clearTimeout(refreshTimer);
  }
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void useExperimentHistoryStore.getState().load({ silent: true });
  }, delayMs);
}

export const useExperimentHistoryStore = create<ExperimentHistoryState>((set, get) => ({
  experiments: [],
  startingExperimentId: null,
  loading: true,
  error: null,

  load: async (options) => {
    set((state) => ({
      loading: !options?.silent || state.experiments.length === 0,
      error: null,
    }));

    try {
      const experiments = await listExperiments();
      set({
        experiments,
        loading: false,
      });
      syncPolling();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      });
    }
  },

  start: async (experimentId) => {
    set({
      startingExperimentId: experimentId,
      error: null,
    });
    try {
      await startExperiment(experimentId);
      set((state) => ({
        experiments: state.experiments.map((item) =>
          item.id === experimentId
            ? {
                ...item,
                status: "running",
                updated_at: new Date().toISOString(),
              }
            : item,
        ),
        startingExperimentId: null,
      }));
      syncPolling();
      scheduleRefresh();
      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        startingExperimentId: null,
      });
      return false;
    }
  },

  dispose: () => {
    clearTimers();
  },
}));
