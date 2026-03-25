import { describe, expect, it } from "vitest";

import {
  ActionEvent,
  AgentErrorEvent,
  MessageEvent,
  ObservationEvent,
  SystemPromptEvent,
  UnknownEvent,
  create_event,
  get_pending_approval_actions,
  get_unmatched_actions,
  hydrate_event,
  hydrate_events,
} from "../src/Event";

describe("Event helpers", () => {
  it("converts llm-convertible event classes to chat messages", () => {
    const systemPrompt = create_event("system_prompt", "agent", {
      system_prompt: {
        type: "text",
        text: "Base prompt",
      },
      dynamic_context: {
        type: "text",
        text: "Repo: alpha",
      },
      tools: [],
    });
    const message = create_event("message", "user", {
      llm_message: {
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      },
      extended_content: [{ type: "text", text: "Extra context" }],
    });
    const action = create_event("action", "agent", {
      tool_name: "terminal",
      arguments: { command: "pwd" },
      summary: "inspect working directory",
      thought: "Checking the workspace first.",
    });
    const observation = create_event("observation", "environment", {
      action_id: action.id,
      tool_name: "terminal",
      result: "/tmp/workspace",
    });
    const agentError = create_event("agent_error", "agent", {
      action_id: action.id,
      tool_name: "terminal",
      error: "permission denied",
    });

    expect(systemPrompt).toBeInstanceOf(SystemPromptEvent);
    expect(systemPrompt.to_llm_message()).toMatchObject({
      role: "system",
      content: [
        { type: "text", text: "Base prompt" },
        { type: "text", text: "Repo: alpha" },
      ],
    });

    expect(message).toBeInstanceOf(MessageEvent);
    expect(message.to_llm_message()).toMatchObject({
      role: "user",
      content: [
        { type: "text", text: "Hello" },
        { type: "text", text: "Extra context" },
      ],
    });

    expect(action).toBeInstanceOf(ActionEvent);
    expect(action.to_llm_message()).toMatchObject({
      role: "assistant",
      content: "Checking the workspace first.",
      tool_calls: [
        {
          id: action.id,
          type: "function",
          function: {
            name: "terminal",
            arguments: JSON.stringify({ command: "pwd" }),
          },
        },
      ],
    });

    expect(observation).toBeInstanceOf(ObservationEvent);
    expect(observation.to_llm_message()).toMatchObject({
      role: "tool",
      tool_call_id: action.id,
      content: "/tmp/workspace",
    });

    expect(agentError).toBeInstanceOf(AgentErrorEvent);
    expect(agentError.to_llm_message()).toMatchObject({
      role: "tool",
      tool_call_id: action.id,
      content: "permission denied",
    });
  });

  it("hydrates serialized events into concrete classes and preserves metadata", () => {
    const created = create_event("message", "assistant", {
      role: "assistant",
      text: "legacy response",
    });
    const serialized = created.toJSON();
    const hydrated = hydrate_event(serialized);

    expect(hydrated).toBeInstanceOf(MessageEvent);
    expect(hydrated.id).toBe(created.id);
    expect(hydrated.timestamp).toBe(created.timestamp);
    expect(hydrated.payload).toMatchObject({
      role: "assistant",
      text: "legacy response",
    });
    expect((hydrated as MessageEvent).to_llm_message()).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "legacy response" }],
    });
  });

  it("hydrates persisted action streams before approval matching", () => {
    const waiting = create_event("action", "agent", {
      tool_name: "terminal",
      arguments: { command: "rm -rf ." },
      executable: false,
      requires_confirmation: true,
      summary: "dangerous cleanup",
    });
    const resolved = create_event("observation", "environment", {
      action_id: waiting.id,
      tool_name: "terminal",
      result: "blocked",
    });
    const anotherWaiting = create_event("action", "agent", {
      tool_name: "terminal",
      arguments: { command: "git clean -fd" },
      executable: false,
      requires_confirmation: true,
      summary: "clean untracked files",
    });

    const hydrated = hydrate_events([
      waiting.toJSON(),
      resolved.toJSON(),
      anotherWaiting.toJSON(),
    ]);

    expect(get_pending_approval_actions(hydrated).map((event) => event.id)).toEqual([
      anotherWaiting.id,
    ]);
  });

  it("falls back to UnknownEvent for unrecognized persisted kinds", () => {
    const unknown = hydrate_event({
      kind: "custom_runtime_event",
      source: "environment",
      payload: {
        detail: "custom payload",
      },
      id: "custom-1",
      timestamp: "2026-03-25T00:00:00.000Z",
    });

    expect(unknown).toBeInstanceOf(UnknownEvent);
    expect(unknown.kind).toBe("custom_runtime_event");
    expect(unknown.payload).toEqual({
      detail: "custom payload",
    });
  });

  it("returns unmatched executable actions without terminal follow-up events", () => {
    const action = create_event("action", "agent", {
      tool_name: "terminal",
      arguments: { command: "pwd" },
      summary: "inspect pwd",
      executable: true,
    });
    const observed = create_event("observation", "environment", {
      action_id: action.id,
      tool_name: "terminal",
      result: "exit_code=0 | stdout=/tmp",
    });

    const unresolved = create_event("action", "agent", {
      tool_name: "file_editor",
      arguments: { command: "write", path: "demo.txt", content: "hi" },
      summary: "write demo file",
      executable: true,
    });

    expect(get_unmatched_actions([action, observed, unresolved]).map((event) => event.id)).toEqual([
      unresolved.id,
    ]);
  });

  it("returns pending approval actions until they receive a terminal follow-up event", () => {
    const waiting = create_event("action", "agent", {
      tool_name: "terminal",
      arguments: { command: "rm -rf ." },
      summary: "delete everything",
      executable: false,
      requires_confirmation: true,
    });
    const approved = create_event("user_approve", "user", {
      action_id: waiting.id,
      reason: "allowed",
    });

    const anotherWaiting = create_event("action", "agent", {
      tool_name: "terminal",
      arguments: { command: "git clean -fd" },
      summary: "clean git ignored files",
      executable: false,
      requires_confirmation: true,
    });

    expect(
      get_pending_approval_actions([waiting, approved, anotherWaiting]).map((event) => event.id),
    ).toEqual([anotherWaiting.id]);
  });
});
