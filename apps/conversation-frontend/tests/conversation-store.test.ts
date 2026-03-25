import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  listConversationEvents: vi.fn(),
  listConversationRuns: vi.fn(),
  postConversationMessage: vi.fn(),
  deleteConversation: vi.fn(),
  approveAction: vi.fn(),
  rejectAction: vi.fn(),
}));

const realtimeMocks = vi.hoisted(() => ({
  connectConversationStream: vi.fn(() => () => undefined),
}));

vi.mock("@/features/conversation/api/client", () => apiMocks);
vi.mock("@/features/conversation/api/realtime", () => realtimeMocks);

describe("useConversationStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bootstraps the active conversation and hydrates events/runs", async () => {
    apiMocks.listConversations.mockResolvedValueOnce([
      {
        conversation_id: "conv-1",
        execution_status: "idle",
        created_at: "2026-03-23T00:00:00.000Z",
        updated_at: "2026-03-23T00:00:00.000Z",
        last_event_at: null,
      },
    ]);
    apiMocks.listConversationEvents.mockResolvedValueOnce([
      {
        seq: 1,
        event_id: "evt-1",
        kind: "message",
        source: "user",
        payload: {
          llm_message: {
            role: "user",
            content: [{ type: "text", text: "hello" }],
          },
          activated_skills: [],
          extended_content: [],
        },
        timestamp: "2026-03-23T00:00:01.000Z",
      },
    ]);
    apiMocks.listConversationRuns.mockResolvedValueOnce([]);

    vi.resetModules();
    const { useConversationStore } = await import("../src/features/conversation/model/store");

    await useConversationStore.getState().bootstrap();

    const state = useConversationStore.getState();
    expect(state.activeConversationId).toBe("conv-1");
    expect(state.events).toHaveLength(1);
    expect(realtimeMocks.connectConversationStream).toHaveBeenCalledTimes(1);
  });

  it("queues a local optimistic run when sending a message", async () => {
    apiMocks.listConversations.mockResolvedValueOnce([
      {
        conversation_id: "conv-1",
        execution_status: "idle",
        created_at: "2026-03-23T00:00:00.000Z",
        updated_at: "2026-03-23T00:00:00.000Z",
        last_event_at: null,
      },
    ]);
    apiMocks.listConversationEvents.mockResolvedValueOnce([]);
    apiMocks.listConversationRuns.mockResolvedValueOnce([]);
    apiMocks.postConversationMessage.mockResolvedValueOnce({
      accepted: true,
      run_id: "run-1",
    });

    vi.resetModules();
    const { useConversationStore } = await import("../src/features/conversation/model/store");

    await useConversationStore.getState().bootstrap();
    await useConversationStore.getState().sendMessage("implement it");

    const state = useConversationStore.getState();
    expect(apiMocks.postConversationMessage).toHaveBeenCalledWith("conv-1", {
      text: "implement it",
    });
    expect(state.runs[0]?.run_id).toBe("run-1");
    expect(state.runs[0]?.status).toBe("queued");
  });
});
