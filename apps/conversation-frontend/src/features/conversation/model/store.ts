import { create } from "zustand";

import {
  approveAction,
  createConversation,
  deleteConversation,
  listConversationEvents,
  listConversationRuns,
  listConversations,
  postConversationMessage,
  rejectAction,
} from "../api/client";
import { connectConversationStream } from "../api/realtime";
import {
  mergeConversationEvent,
  mergeConversationRun,
  toConversationItem,
} from "../lib/merge";
import type {
  ConversationEvent,
  ConversationItem,
  ConversationRun,
} from "./types";

type ConversationState = {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  events: ConversationEvent[];
  runs: ConversationRun[];
  latestRunId: string | null;
  pendingActionId: string | null;
  status: string;
  busy: boolean;
  isSending: boolean;
  isDeciding: boolean;
  eventsDrawerOpen: boolean;
  lastError: string | null;
  loadingConversationId: string | null;
  bootstrapped: boolean;
  bootstrap: () => Promise<void>;
  dispose: () => void;
  selectConversation: (conversationId: string) => Promise<void>;
  createConversation: () => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  approvePendingAction: () => Promise<void>;
  rejectPendingAction: () => Promise<void>;
  setEventsDrawerOpen: (open: boolean) => void;
  clearError: () => void;
};

let streamCleanup: (() => void) | null = null;
let bootstrapPromise: Promise<void> | null = null;

function stopStream() {
  streamCleanup?.();
  streamCleanup = null;
}

function resolveLatestRunMeta(runs: ConversationRun[]) {
  const latestRun = runs[0] ?? null;
  const waitingRun = runs.find((run) => run.status === "waiting_approval" && run.waiting_action_id);
  return {
    latestRunId: latestRun?.run_id ?? null,
    pendingActionId: waitingRun?.waiting_action_id ?? null,
  };
}

function updateConversationStatus(
  conversations: ConversationItem[],
  conversationId: string,
  status: string,
  lastEventAt?: string,
) {
  return conversations.map((conversation) =>
    conversation.conversation_id === conversationId
      ? {
          ...conversation,
          execution_status: status,
          updated_at: lastEventAt ?? conversation.updated_at,
          last_event_at: lastEventAt ?? conversation.last_event_at,
        }
      : conversation,
  );
}

async function loadConversationContext(conversationId: string, status?: string) {
  useConversationStore.setState({
    activeConversationId: conversationId,
    status: status ?? useConversationStore.getState().status,
    events: [],
    runs: [],
    latestRunId: null,
    pendingActionId: null,
    loadingConversationId: conversationId,
    lastError: null,
  });

  stopStream();

  try {
    const [history, runRows] = await Promise.all([
      listConversationEvents(conversationId, 0, 1_000),
      listConversationRuns(conversationId, 100),
    ]);

    if (useConversationStore.getState().loadingConversationId !== conversationId) {
      return;
    }

    const { latestRunId, pendingActionId } = resolveLatestRunMeta(runRows);
    useConversationStore.setState({
      activeConversationId: conversationId,
      events: history,
      runs: runRows,
      latestRunId,
      pendingActionId,
      loadingConversationId: null,
    });

    streamCleanup = connectConversationStream({
      conversationId,
      getAfterSeq: () => {
        const current = useConversationStore.getState().events;
        return current.length > 0 ? current[current.length - 1].seq : 0;
      },
      onEvent: (event) => {
        useConversationStore.setState((state) => ({
          events: mergeConversationEvent(state.events, event),
          conversations: updateConversationStatus(
            state.conversations,
            conversationId,
            state.status,
            event.timestamp,
          ),
        }));
      },
      onStatus: (nextStatus) => {
        useConversationStore.setState((state) => ({
          status: nextStatus,
          conversations: updateConversationStatus(state.conversations, conversationId, nextStatus),
        }));
      },
      onRun: (run) => {
        useConversationStore.setState((state) => {
          const runs = mergeConversationRun(state.runs, run);
          const { latestRunId: nextRunId, pendingActionId } = resolveLatestRunMeta(runs);
          return {
            runs,
            latestRunId: nextRunId,
            pendingActionId,
          };
        });
      },
      onError: (message) => {
        useConversationStore.setState({ lastError: message });
      },
    });
  } catch (error) {
    if (useConversationStore.getState().loadingConversationId === conversationId) {
      useConversationStore.setState({
        loadingConversationId: null,
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function refreshRuns(conversationId: string) {
  const runRows = await listConversationRuns(conversationId, 100);
  const { latestRunId, pendingActionId } = resolveLatestRunMeta(runRows);
  useConversationStore.setState({
    runs: runRows,
    latestRunId,
    pendingActionId,
  });
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  events: [],
  runs: [],
  latestRunId: null,
  pendingActionId: null,
  status: "idle",
  busy: false,
  isSending: false,
  isDeciding: false,
  eventsDrawerOpen: false,
  lastError: null,
  loadingConversationId: null,
  bootstrapped: false,

  bootstrap: async () => {
    if (get().bootstrapped) {
      return;
    }
    if (bootstrapPromise) {
      return bootstrapPromise;
    }

    bootstrapPromise = (async () => {
      set({ busy: true, lastError: null });
      try {
        const items = await listConversations();
        if (items.length === 0) {
          const created = await createConversation();
          const conversation = toConversationItem(created);
          set({
            conversations: [conversation],
            status: conversation.execution_status,
            bootstrapped: true,
          });
          await loadConversationContext(conversation.conversation_id, conversation.execution_status);
          return;
        }

        set({
          conversations: items,
          status: items[0].execution_status,
          bootstrapped: true,
        });
        await loadConversationContext(items[0].conversation_id, items[0].execution_status);
      } catch (error) {
        set({ lastError: error instanceof Error ? error.message : String(error) });
      } finally {
        set({ busy: false });
      }
    })().finally(() => {
      bootstrapPromise = null;
    });

    return bootstrapPromise;
  },

  dispose: () => {
    stopStream();
  },

  selectConversation: async (conversationId) => {
    const selected = get().conversations.find(
      (conversation) => conversation.conversation_id === conversationId,
    );
    await loadConversationContext(conversationId, selected?.execution_status);
  },

  createConversation: async () => {
    set({ busy: true, lastError: null });
    try {
      const created = await createConversation();
      const next = toConversationItem(created);
      set((state) => ({
        conversations: [next, ...state.conversations],
        status: next.execution_status,
      }));
      await loadConversationContext(next.conversation_id, next.execution_status);
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ busy: false });
    }
  },

  deleteConversation: async (conversationId) => {
    set({ busy: true, lastError: null });
    try {
      await deleteConversation(conversationId);
      const remaining = get().conversations.filter(
        (conversation) => conversation.conversation_id !== conversationId,
      );
      set({ conversations: remaining });

      if (get().activeConversationId !== conversationId) {
        return;
      }

      if (remaining.length > 0) {
        const next = remaining[0];
        set({ status: next.execution_status });
        await loadConversationContext(next.conversation_id, next.execution_status);
        return;
      }

      const created = await createConversation();
      const replacement = toConversationItem(created);
      set({
        conversations: [replacement],
        status: replacement.execution_status,
      });
      await loadConversationContext(replacement.conversation_id, replacement.execution_status);
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ busy: false });
    }
  },

  sendMessage: async (text) => {
    const { activeConversationId, isSending } = get();
    if (!activeConversationId || isSending) {
      return;
    }

    set({ isSending: true, lastError: null });
    try {
      const result = await postConversationMessage(activeConversationId, { text });
      set((state) => ({
        latestRunId: result.run_id,
        runs: mergeConversationRun(state.runs, {
          run_id: result.run_id,
          conversation_id: activeConversationId,
          status: "queued",
          waiting_action_id: null,
          error_detail: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }));
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ isSending: false });
    }
  },

  approvePendingAction: async () => {
    const { activeConversationId, pendingActionId, isDeciding } = get();
    if (!activeConversationId || !pendingActionId || isDeciding) {
      return;
    }

    set({ isDeciding: true, lastError: null });
    try {
      await approveAction(activeConversationId, pendingActionId);
      await refreshRuns(activeConversationId);
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ isDeciding: false });
    }
  },

  rejectPendingAction: async () => {
    const { activeConversationId, pendingActionId, isDeciding } = get();
    if (!activeConversationId || !pendingActionId || isDeciding) {
      return;
    }

    set({ isDeciding: true, lastError: null });
    try {
      await rejectAction(activeConversationId, pendingActionId);
      await refreshRuns(activeConversationId);
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ isDeciding: false });
    }
  },

  setEventsDrawerOpen: (open) => {
    set({ eventsDrawerOpen: open });
  },

  clearError: () => {
    set({ lastError: null });
  },
}));
