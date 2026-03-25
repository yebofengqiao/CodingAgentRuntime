import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AgentContext,
  build_llm_view,
  get_message_text,
  get_system_prompt_content_blocks,
  get_system_prompt_text,
  build_system_prompt_event,
  build_user_message_event,
  load_project_skills,
  maybe_build_condensation_event,
  resolve_runtime_context,
} from "../src/runtime";

const workspaces: string[] = [];

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "runtime-core-context-"));
  workspaces.push(workspace);
  return workspace;
}

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop()!, { recursive: true, force: true });
  }
});

describe("Runtime context", () => {
  it("loads AGENTS.md and project skills from the context root", () => {
    const workspace = createWorkspace();
    mkdirSync(resolve(workspace, ".agents", "skills"), { recursive: true });
    writeFileSync(resolve(workspace, "AGENTS.md"), "# Repo guide\nUse focused edits.\n", "utf-8");
    writeFileSync(
      resolve(workspace, ".agents", "skills", "i18n-guide.md"),
      [
        "---",
        "description: Reuse locale bundles.",
        "triggers:",
        "  - locale",
        "  - i18n",
        "---",
        "# i18n-guide",
        "",
        "Update feature-local locale bundles first.",
      ].join("\n"),
      "utf-8",
    );

    const skills = load_project_skills(workspace);
    expect(skills.map((skill) => skill.name)).toEqual(["agents", "i18n-guide"]);

    const runtime_context = resolve_runtime_context({ context_root: workspace }, workspace);
    const systemPrompt = build_system_prompt_event({
      runtime_context,
      working_dir: workspace,
    });

    expect(get_system_prompt_text(systemPrompt.payload)).toContain("<REPO_CONTEXT>");
    expect(get_system_prompt_text(systemPrompt.payload)).toContain("<available_skills>");
    expect(get_system_prompt_text(systemPrompt.payload)).toContain("i18n-guide");
    expect(systemPrompt.payload.system_prompt.text).toBe(runtime_context.base_system_prompt);
    expect(systemPrompt.payload.dynamic_context?.text).toContain("<REPO_CONTEXT>");
    expect(get_system_prompt_content_blocks(systemPrompt.payload)).toHaveLength(2);
    expect(systemPrompt.payload.tools.map((tool) => tool.name)).toEqual([
      "terminal",
      "file_editor",
      "task_tracker",
    ]);
  });

  it("augments user messages and skips knowledge skills that were already activated", () => {
    const workspace = createWorkspace();
    mkdirSync(resolve(workspace, ".agents", "skills"), { recursive: true });
    writeFileSync(resolve(workspace, "AGENTS.md"), "# Repo guide\nUse focused edits.\n", "utf-8");
    writeFileSync(
      resolve(workspace, ".agents", "skills", "i18n-guide.md"),
      [
        "---",
        "description: Reuse locale bundles.",
        "triggers:",
        "  - locale",
        "  - i18n",
        "---",
        "# i18n-guide",
        "",
        "Update feature-local locale bundles first.",
      ].join("\n"),
      "utf-8",
    );

    const runtime_context = resolve_runtime_context({ context_root: workspace }, workspace);
    const priorEvents = [
      build_system_prompt_event({
        runtime_context,
        working_dir: workspace,
      }),
    ];

    const firstUserEvent = build_user_message_event({
      raw_text: "Please update the locale copy",
      prior_events: priorEvents,
      runtime_context,
    });
    expect(firstUserEvent.payload.activated_skills).toEqual(["i18n-guide"]);
    expect(get_message_text(firstUserEvent.payload)).toContain("<EXTRA_INFO>");
    expect(get_message_text(firstUserEvent.payload)).toContain('keyword match for "locale"');
    expect(firstUserEvent.payload.llm_message?.content[0]?.text).toBe("Please update the locale copy");
    expect(firstUserEvent.payload.extended_content?.[0]?.type).toBe("text");

    const secondUserEvent = build_user_message_event({
      raw_text: "Please update the locale copy again",
      prior_events: [...priorEvents, firstUserEvent],
      runtime_context,
    });
    expect(secondUserEvent.payload.activated_skills).toEqual([]);
    expect(get_message_text(secondUserEvent.payload)).not.toContain("<EXTRA_INFO>");
  });

  it("prefers explicit skip_skill_names over re-scanning prior events", () => {
    const workspace = createWorkspace();
    mkdirSync(resolve(workspace, ".agents", "skills"), { recursive: true });
    writeFileSync(
      resolve(workspace, ".agents", "skills", "i18n-guide.md"),
      [
        "---",
        "description: Reuse locale bundles.",
        "triggers:",
        "  - locale",
        "---",
        "# i18n-guide",
        "",
        "Update feature-local locale bundles first.",
      ].join("\n"),
      "utf-8",
    );

    const runtime_context = resolve_runtime_context({ context_root: workspace }, workspace);
    const event = build_user_message_event({
      raw_text: "Please update the locale copy",
      prior_events: [],
      runtime_context,
      skip_skill_names: ["i18n-guide"],
    });

    expect(event.payload.activated_skills).toEqual([]);
    expect(get_message_text(event.payload)).not.toContain("<EXTRA_INFO>");
  });

  it("renders current datetime through AgentContext and keeps it in dynamic context only", () => {
    const workspace = createWorkspace();
    const agentContext = new AgentContext({
      current_datetime: "2026-03-23T20:00:00.000Z",
      system_message_suffix: "Follow repository conventions.",
    });

    const dynamicContext = agentContext.get_system_message_suffix({
      working_dir: workspace,
      context_root: workspace,
    });

    expect(dynamicContext).toContain("<CURRENT_DATETIME>");
    expect(dynamicContext).toContain("2026-03-23T20:00:00.000Z");
    expect(dynamicContext).toContain("Follow repository conventions.");
  });

  it("builds a condensed LLM view without deleting original events", () => {
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

    const events = [
      build_system_prompt_event({
        runtime_context,
        working_dir: workspace,
      }),
      build_user_message_event({
        raw_text: "Task one",
        prior_events: [],
        runtime_context,
      }),
      {
        kind: "message",
        source: "agent",
        payload: { role: "assistant", text: "Ack" },
        id: "assistant-1",
        timestamp: new Date().toISOString(),
      },
      {
        kind: "action",
        source: "agent",
        payload: {
          tool_name: "terminal",
          summary: "inspect pwd",
          arguments: { command: "pwd" },
        },
        id: "action-1",
        timestamp: new Date().toISOString(),
      },
      {
        kind: "observation",
        source: "environment",
        payload: {
          action_id: "action-1",
          tool_name: "terminal",
          result: "exit_code=0 | stdout=/tmp/demo",
        },
        id: "observation-1",
        timestamp: new Date().toISOString(),
      },
    ];

    const condensationEvent = maybe_build_condensation_event(events, runtime_context.condenser);
    expect(condensationEvent).not.toBeNull();

    const condensedView = build_llm_view([...events, condensationEvent!]);
    expect(events).toHaveLength(5);
    expect(condensedView.some((entry) => entry.type === "summary")).toBe(true);
    expect(condensedView.length).toBeLessThan(events.length);
  });
});
