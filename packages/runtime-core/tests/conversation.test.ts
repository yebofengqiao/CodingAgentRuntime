import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { build_system_prompt_event, resolve_runtime_context } from "../src/runtime";
import {
  Conversation,
  LocalConversation,
} from "../src/Conversation/conversation";
import { create_event } from "../src/Event/event";

const workspaces: string[] = [];

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "runtime-core-conversation-"));
  workspaces.push(workspace);
  return workspace;
}

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop()!, { recursive: true, force: true });
  }
});

describe("Conversation", () => {
  it("returns a LocalConversation instance from the Conversation facade", () => {
    const conversation = new Conversation({
      workspace: createWorkspace(),
      agent: {
        async init_state() {},
        async step() {},
      },
    });

    expect(conversation).toBeInstanceOf(LocalConversation);
  });

  it("moves from idle to finished when the agent finishes", async () => {
    const conversation = new Conversation({
      workspace: createWorkspace(),
      agent: {
        async init_state() {},
        async step(currentConversation, on_event) {
          await on_event(
            create_event("message", "agent", {
              role: "assistant",
              text: "done",
            }),
          );
          currentConversation.finish();
        },
      },
    });

    const result = await conversation.run();

    expect(result.execution_status).toBe("finished");
    expect(conversation.state.execution_status).toBe("finished");
    expect(conversation.state.events.at(-1)).toMatchObject({
      kind: "message",
      payload: { role: "assistant", text: "done" },
    });
  });

  it("enters waiting_for_confirmation when the agent requests approval", async () => {
    const conversation = new Conversation({
      workspace: createWorkspace(),
      agent: {
        async init_state() {},
        async step(currentConversation) {
          currentConversation.state.execution_status = "waiting_for_confirmation";
        },
      },
    });

    const result = await conversation.run();

    expect(result.execution_status).toBe("waiting_for_confirmation");
  });

  it("records cancellation as a conversation_error event", async () => {
    const conversation = new Conversation({
      workspace: createWorkspace(),
      agent: {
        async init_state() {},
        async step() {
          throw new Error("step should not run when cancelled");
        },
      },
    });

    const result = await conversation.run({
      cancel_requested: () => true,
    });

    expect(result.execution_status).toBe("error");
    expect(conversation.state.events.at(-1)).toMatchObject({
      kind: "conversation_error",
      payload: { code: "Cancelled" },
    });
  });

  it("records runtime errors from the agent", async () => {
    const conversation = new Conversation({
      workspace: createWorkspace(),
      agent: {
        async init_state() {},
        async step() {
          throw new Error("boom");
        },
      },
    });

    const result = await conversation.run();

    expect(result.execution_status).toBe("error");
    expect(conversation.state.events.at(-1)).toMatchObject({
      kind: "conversation_error",
      payload: expect.objectContaining({
        code: "Error",
        detail: "boom",
      }),
    });
  });

  it("fails with MaxIterationsReached when the agent makes no progress", async () => {
    const step = vi.fn(async () => undefined);
    const conversation = new Conversation({
      workspace: createWorkspace(),
      max_iterations: 1,
      agent: {
        async init_state() {},
        step,
      },
    });

    const result = await conversation.run();

    expect(step).toHaveBeenCalledTimes(1);
    expect(result.execution_status).toBe("error");
    expect(conversation.state.events.at(-1)).toMatchObject({
      kind: "conversation_error",
      payload: { code: "MaxIterationsReached" },
    });
  });

  it("re-enters running when a finished conversation is run again", async () => {
    const step = vi.fn(async (currentConversation, on_event) => {
      await on_event(
        create_event("message", "agent", {
          role: "assistant",
          text: "follow-up",
        }),
      );
      currentConversation.finish();
    });
    const conversation = new Conversation({
      workspace: createWorkspace(),
      agent: {
        async init_state() {},
        step,
      },
    });
    conversation.state.execution_status = "finished";
    conversation.state.events.push(
      create_event("message", "user", {
        role: "user",
        text: "follow-up question",
      }),
    );

    const result = await conversation.run();

    expect(step).toHaveBeenCalledTimes(1);
    expect(result.execution_status).toBe("finished");
    expect(conversation.state.events.at(-1)).toMatchObject({
      kind: "message",
      payload: { role: "assistant", text: "follow-up" },
    });
  });

  it("writes system_prompt before the first user message when runtime context is enabled", async () => {
    const workspace = createWorkspace();
    mkdirSync(resolve(workspace, ".agents", "skills"), { recursive: true });
    writeFileSync(resolve(workspace, "AGENTS.md"), "# Repo guide\nUse focused edits.\n", "utf-8");
    writeFileSync(
      resolve(workspace, ".agents", "skills", "i18n-guide.md"),
      [
        "---",
        "triggers:",
        "  - locale",
        "---",
        "# i18n-guide",
        "",
        "Update locale bundles first.",
      ].join("\n"),
      "utf-8",
    );
    const runtime_context = resolve_runtime_context({ context_root: workspace }, workspace);

    const conversation = new Conversation({
      workspace,
      runtime_context,
      agent: {
        async init_state(state, on_event, currentConversation) {
          await on_event(
            build_system_prompt_event({
              runtime_context,
              working_dir: currentConversation.workspace.working_dir,
            }),
          );
        },
        async step() {},
      },
    });

    await conversation.send_message("Please update the locale copy");

    expect(conversation.state.events[0]).toMatchObject({
      kind: "system_prompt",
    });
    expect(conversation.state.events[1]).toMatchObject({
      kind: "message",
      source: "user",
      payload: expect.objectContaining({
        activated_skills: ["i18n-guide"],
        llm_message: {
          role: "user",
          content: [{ type: "text", text: "Please update the locale copy" }],
        },
      }),
    });
    expect(conversation.state.activated_knowledge_skills).toEqual(["i18n-guide"]);

    await conversation.send_message("Please update the locale copy again");
    expect(conversation.state.events[2]).toMatchObject({
      kind: "message",
      source: "user",
      payload: expect.objectContaining({
        activated_skills: [],
      }),
    });
    expect(conversation.state.activated_knowledge_skills).toEqual(["i18n-guide"]);
  });

  it("loads plugins and file-based agents before agent init_state", async () => {
    const workspace = createWorkspace();
    mkdirSync(resolve(workspace, ".agents", "agents"), { recursive: true });
    writeFileSync(
      resolve(workspace, ".agents", "agents", "reviewer.md"),
      "# reviewer\nHelp with reviews.\n",
      "utf-8",
    );

    const init_state = vi.fn(async (_state, _onEvent, currentConversation: LocalConversation) => {
      expect(currentConversation._plugins_loaded).toBe(true);
      expect(currentConversation._file_based_agents_registered).toBe(true);
      expect(currentConversation._agent_ready).toBe(false);
      expect(currentConversation.registered_file_agents).toEqual(["reviewer"]);
    });

    const conversation = new Conversation({
      workspace,
      agent: {
        init_state,
        async step(currentConversation) {
          currentConversation.finish();
        },
      },
    });

    await conversation.run();

    expect(init_state).toHaveBeenCalledTimes(1);
    expect(conversation._agent_ready).toBe(true);
  });
});
