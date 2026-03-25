import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Agent,
  actions_from_tool_calls,
  build_system_prompt_event,
  build_user_message_event,
  prepare_llm_messages,
  normalize_llm_model,
  normalize_actions,
  parse_structured_payload,
  type LlmConfig,
} from "../src/Agent";
import {
  ConversationState,
  create_event,
  type Event,
} from "../src/Event";
import { resolve_runtime_context } from "../src/runtime";
import { ToolRuntime } from "../src/Tool/tool";

const workspaces: string[] = [];

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "runtime-core-agent-"));
  workspaces.push(workspace);
  return workspace;
}

function createLlmConfig(): LlmConfig {
  return {
    apiKey: "test-key",
    model: "test-model",
  };
}

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop()!, { recursive: true, force: true });
  }
});

describe("Agent helpers", () => {
  it("normalizes tool calls into planned actions", () => {
    const toolRuntime = new ToolRuntime();
    const actions = actions_from_tool_calls(toolRuntime, [
      {
        id: "call-1",
        type: "function",
        function: {
          name: "terminal",
          arguments: JSON.stringify({
            command: "pwd",
            summary: "inspect cwd",
            security_risk: "HIGH",
          }),
        },
      },
    ] as never);

    expect(actions).toEqual([
      {
        tool_name: "terminal",
        arguments: { command: "pwd" },
        summary: "inspect cwd",
        security_risk: "high",
      },
    ]);
  });

  it("parses structured JSON fallback payloads into normalized actions", () => {
    const toolRuntime = new ToolRuntime();
    const parsed = parse_structured_payload(`\`\`\`json
{"actions":[{"tool_name":"file_editor","arguments":{"command":"write","path":"demo.txt","content":"hi"},"security_risk":"low"}]}
\`\`\``);

    expect(parsed).not.toBeNull();
    expect(normalize_actions(toolRuntime, parsed?.actions)).toEqual([
      {
        tool_name: "file_editor",
        arguments: { command: "write", path: "demo.txt", content: "hi" },
        summary: 'file_editor: {"command":"write","path":"demo.txt","content":"hi"}',
        security_risk: "low",
      },
    ]);
  });

  it("normalizes prefixed endpoint ids for third-party OpenAI-compatible services", () => {
    expect(
      normalize_llm_model(
        "openai/ep-20260209203326-p2wbt",
        "https://ark-cn-beijing.bytedance.net/api/v3",
      ),
    ).toBe("ep-20260209203326-p2wbt");
    expect(
      normalize_llm_model("openai/gpt-4o-mini", "https://openrouter.ai/api/v1"),
    ).toBe("openai/gpt-4o-mini");
    expect(
      normalize_llm_model("openai/gpt-4o-mini", "https://api.openai.com/v1"),
    ).toBe("openai/gpt-4o-mini");
  });

  it("emits assistant fallback replies and finishes the conversation", async () => {
    const state = ConversationState.create();
    state.events.push(build_system_prompt_event());
    state.events.push(
      create_event("message", "user", {
        role: "user",
        text: "say hello",
      }),
    );

    const finish = vi.fn(() => {
      state.execution_status = "finished";
    });
    const emitted = vi.fn(async () => undefined);

    const agent = new Agent({
      llmConfig: createLlmConfig(),
      planner: async () => ({
        thought: "",
        actions: [],
        assistantReply: "hello",
      }),
    });

    await agent.step(
      {
        state,
        workspace: { working_dir: createWorkspace() },
        finish,
      },
      emitted,
    );

    expect(finish).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "message",
        payload: expect.objectContaining({
          llm_message: expect.objectContaining({
            role: "assistant",
            content: [{ type: "text", text: "hello" }],
          }),
        }),
      }),
    );
  });

  it("executes low-risk planned actions in the same step after emitting action events", async () => {
    const workspace = createWorkspace();
    const state = ConversationState.create();
    state.events.push(build_system_prompt_event({ working_dir: workspace }));
    state.events.push(
      create_event("message", "user", {
        role: "user",
        text: "track a task",
      }),
    );

    const emittedEvents: Event[] = [];
    const onEvent = vi.fn(async (event) => {
      emittedEvents.push(event);
      state.events.push(event);
    });

    const agent = new Agent({
      llmConfig: createLlmConfig(),
      planner: async () => ({
        thought: "I should track this task.",
        actions: [
          {
            tool_name: "task_tracker",
            arguments: { command: "add", title: "demo task" },
            summary: "record task",
            security_risk: "low",
          },
        ],
        assistantReply: "",
      }),
    });
    await agent.init_state(state, vi.fn(async () => undefined), {
      state,
      workspace: { working_dir: workspace },
      finish: vi.fn(),
    });

    await agent.step(
      {
        state,
        workspace: { working_dir: workspace },
        finish: vi.fn(),
      },
      onEvent,
    );

    expect(emittedEvents.map((event) => event.kind)).toEqual(["action", "observation"]);
    expect(emittedEvents[0]).toMatchObject({
      kind: "action",
      payload: expect.objectContaining({
        tool_name: "task_tracker",
        executable: true,
      }),
    });
    expect(emittedEvents[1]).toMatchObject({
      kind: "observation",
      payload: expect.objectContaining({
        tool_name: "task_tracker",
        result: "added task #1",
      }),
    });
  });

  it("keeps static_system_message stable while get_dynamic_context varies with runtime context", () => {
    const firstWorkspace = createWorkspace();
    const secondWorkspace = createWorkspace();
    const firstContext = resolve_runtime_context(
      {
        context_root: firstWorkspace,
        system_message_suffix: "Repo: alpha",
      },
      firstWorkspace,
    );
    const secondContext = resolve_runtime_context(
      {
        context_root: secondWorkspace,
        system_message_suffix: "Repo: beta",
      },
      secondWorkspace,
    );

    const firstAgent = new Agent({
      llmConfig: createLlmConfig(),
      runtime_context: firstContext,
    });
    const secondAgent = new Agent({
      llmConfig: createLlmConfig(),
      runtime_context: secondContext,
    });

    expect(firstAgent.static_system_message).toBe(secondAgent.static_system_message);
    expect(
      firstAgent.get_dynamic_context(ConversationState.create(), {
        state: ConversationState.create(),
        workspace: { working_dir: firstWorkspace },
        finish: vi.fn(),
      }),
    ).toContain("Repo: alpha");
    expect(
      secondAgent.get_dynamic_context(ConversationState.create(), {
        state: ConversationState.create(),
        workspace: { working_dir: secondWorkspace },
        finish: vi.fn(),
      }),
    ).toContain("Repo: beta");
  });

  it("prepares LLM messages with split system blocks and structured user extensions", () => {
    const workspace = createWorkspace();
    const runtime_context = resolve_runtime_context(
      {
        context_root: workspace,
        system_message_suffix: "Repo: alpha",
        user_message_suffix: "Use terse replies.",
      },
      workspace,
    );
    const events = [
      build_system_prompt_event({
        runtime_context,
        working_dir: workspace,
      }),
      build_user_message_event({
        raw_text: "Hello",
        prior_events: [],
        runtime_context,
      }),
      create_event("message", "assistant", {
        role: "assistant",
        text: "legacy response",
      }),
    ];

    const messages = prepare_llm_messages(events);

    expect(Array.isArray(messages[0]?.content)).toBe(true);
    expect(messages[0]?.role).toBe("system");
    expect((messages[0]?.content as { text: string }[])).toHaveLength(2);
    expect((messages[0]?.content as { text: string }[])[0]?.text).toBe(
      runtime_context.base_system_prompt,
    );
    expect((messages[0]?.content as { text: string }[])[1]?.text).toContain("Repo: alpha");
    expect(messages[1]).toMatchObject({
      role: "user",
    });
    expect(messages[2]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "legacy response" }],
    });
  });

  it("does not duplicate the system prompt when one already exists", async () => {
    const state = ConversationState.create();
    state.events.push(build_system_prompt_event());

    const agent = new Agent({ llmConfig: createLlmConfig() });
    const onEvent = vi.fn(async () => undefined);

    await agent.init_state(state, onEvent);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("materializes tools via AgentBase before emitting system prompt", async () => {
    const state = ConversationState.create();
    const onEvent = vi.fn(async () => undefined);
    const agent = new Agent({
      llmConfig: createLlmConfig(),
    });

    expect(agent.initialized).toBe(false);
    expect(agent.tool_definitions).toEqual([]);

    await agent.init_state(state, onEvent, {
      state,
      workspace: { working_dir: createWorkspace() },
      finish: vi.fn(),
    });

    expect(agent.initialized).toBe(true);
    expect(agent.tool_definitions.map((tool) => tool.name)).toEqual([
      "terminal",
      "file_editor",
      "task_tracker",
    ]);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "system_prompt",
        payload: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: "terminal" }),
            expect.objectContaining({ name: "file_editor" }),
            expect.objectContaining({ name: "task_tracker" }),
          ]),
        }),
      }),
    );
  });

  it("throws when a user message appears before the system prompt in the init prefix", async () => {
    const state = ConversationState.create();
    state.events.push(
      create_event("message", "user", {
        role: "user",
        text: "hello before init",
      }),
    );

    const agent = new Agent({
      llmConfig: createLlmConfig(),
    });

    await expect(
      agent.init_state(state, vi.fn(async () => undefined), {
        state,
        workspace: { working_dir: createWorkspace() },
        finish: vi.fn(),
      }),
    ).rejects.toMatchObject({
      name: "AssertionError",
    });
  });

  it("emits a condensation event before planning when the view is too large", async () => {
    const workspace = createWorkspace();
    const runtime_context = resolve_runtime_context(
      {
        context_root: workspace,
        condenser: {
          type: "event_summary_v1",
          max_events: 4,
          keep_first: 1,
          keep_recent: 2,
        },
      },
      workspace,
    );

    const state = ConversationState.create();
    state.events.push(
      build_system_prompt_event({
        runtime_context,
        working_dir: workspace,
      }),
    );
    state.events.push(
      create_event("message", "user", {
        role: "user",
        text: "first task",
      }),
    );
    state.events.push(
      create_event("message", "agent", {
        role: "assistant",
        text: "ack",
      }),
    );
    state.events.push(
      create_event("message", "user", {
        role: "user",
        text: "second task",
      }),
    );
    state.events.push(
      create_event("message", "agent", {
        role: "assistant",
        text: "second ack",
      }),
    );

    const planner = vi.fn(async () => ({
      thought: "",
      actions: [],
      assistantReply: "should not execute before condensation",
    }));
    const emitted = vi.fn(async () => undefined);

    const agent = new Agent({
      llmConfig: createLlmConfig(),
      planner,
      runtime_context,
    });

    await agent.step(
      {
        state,
        workspace: { working_dir: workspace },
        finish: vi.fn(),
      },
      emitted,
    );

    expect(planner).not.toHaveBeenCalled();
    expect(emitted).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "condensation",
        payload: expect.objectContaining({
          reason: "event_count",
        }),
      }),
    );
  });

  it("executes approved high-risk actions on the next step without replanning", async () => {
    const workspace = createWorkspace();
    const state = ConversationState.create();
    state.events.push(build_system_prompt_event({ working_dir: workspace }));
    state.events.push(
      create_event("message", "user", {
        role: "user",
        text: "run pwd",
      }),
    );

    const planner = vi.fn(async () => ({
      thought: "Need to inspect the workspace.",
      actions: [
        {
          tool_name: "terminal",
          arguments: { command: "pwd" },
          summary: "inspect cwd",
          security_risk: "high",
        },
      ],
      assistantReply: "",
    }));

    const emittedEvents: Event[] = [];
    const onEvent = vi.fn(async (event: Event) => {
      emittedEvents.push(event);
      state.events.push(event);
    });

    const agent = new Agent({
      llmConfig: createLlmConfig(),
      planner,
    });
    await agent.init_state(state, vi.fn(async () => undefined), {
      state,
      workspace: { working_dir: workspace },
      finish: vi.fn(),
    });

    await agent.step(
      {
        state,
        workspace: { working_dir: workspace },
        finish: vi.fn(),
      },
      onEvent,
    );

    expect(planner).toHaveBeenCalledTimes(1);
    expect(state.execution_status).toBe("waiting_for_confirmation");
    expect(emittedEvents.map((event) => event.kind)).toEqual(["action"]);

    const actionEvent = emittedEvents[0]!;
    state.events.push(
      create_event("user_approve", "user", {
        action_id: actionEvent.id,
        reason: null,
      }),
    );
    state.execution_status = "idle";
    emittedEvents.length = 0;
    onEvent.mockClear();

    await agent.step(
      {
        state,
        workspace: { working_dir: workspace },
        finish: vi.fn(),
      },
      onEvent,
    );

    expect(planner).toHaveBeenCalledTimes(1);
    expect(emittedEvents.map((event) => event.kind)).toEqual(["observation"]);
    expect(emittedEvents[0]).toMatchObject({
      kind: "observation",
      payload: expect.objectContaining({
        action_id: actionEvent.id,
        tool_name: "terminal",
      }),
    });
  });
});
