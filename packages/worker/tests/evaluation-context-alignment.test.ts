import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { settings } from "@openhands-rl/backend-core/config";
import { getCase, getVariant } from "@openhands-rl/backend-core/evaluation/catalog";
import { buildPromptBundle } from "@openhands-rl/backend-core/evaluation/services/context-assembler";
import { resolveStrategyBundleByVariant } from "@openhands-rl/backend-core/evaluation/services/strategy-resolver";
import {
  build_system_prompt_event,
  build_user_message_event,
  get_message_text,
  get_system_prompt_text,
  resolve_runtime_context,
} from "@openhands-rl/runtime-core/runtime";

const workspaces: string[] = [];

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "evaluation-context-alignment-"));
  workspaces.push(workspace);
  return workspace;
}

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop()!, { recursive: true, force: true });
  }
});

describe("evaluation context alignment", () => {
  it("routes repo-policy packages into repo context and SKILL.md packages into available skills", () => {
    const caseDefinition = getCase("FE_BUTTON_01");
    const baselineVariant = getVariant("ft-button-skill-baseline-v1");
    const comparisonVariant = getVariant("ft-button-skill-v2");
    const strategy = resolveStrategyBundleByVariant(comparisonVariant, baselineVariant);
    const promptBundle = buildPromptBundle(caseDefinition, strategy);

    expect(promptBundle.system_message_suffix).not.toContain("# Skill Packages");
    expect(promptBundle.system_message_suffix).not.toContain("# Repo Policy Packages");
    expect(promptBundle.loaded_skills).toContain("button-usage");
    expect(promptBundle.loaded_skills).not.toContain("frontend-base");

    const workspace = createWorkspace();
    const runtimeContext = resolve_runtime_context(
      {
        ...promptBundle.runtime_context,
        platform_context_root: settings.platformContextRoot,
        workspace_context_root: workspace,
      },
      workspace,
    );
    const systemPromptEvent = build_system_prompt_event({
      runtime_context: runtimeContext,
      working_dir: workspace,
    });
    const systemPromptText = get_system_prompt_text(systemPromptEvent.payload);

    expect(systemPromptText).toContain("<REPO_CONTEXT>");
    expect(systemPromptText).toContain("[BEGIN context from frontend-base]");
    expect(systemPromptText).toContain("Do not modify `packages/ui/**` in these evaluation tasks.");
    expect(systemPromptText).toContain("<available_skills>");
    expect(systemPromptText).toContain("<name>button-usage</name>");
    expect(systemPromptText).not.toContain("[BEGIN context from button-usage]");
    expect(systemPromptText).not.toContain(
      "Replace a native `<button>` with the shared `Button` component from `packages/ui/Button`.",
    );
  });

  it("supports repo-context, available-skill, and triggered button package variants", () => {
    const caseDefinition = getCase("FE_BUTTON_01");
    const baselineVariant = getVariant("ft-button-skill-baseline-v1");
    const availableVariant = getVariant("ft-button-skill-v2");
    const triggeredVariant = getVariant("ft-button-skill-v3");

    const workspace = createWorkspace();

    const baselineStrategy = resolveStrategyBundleByVariant(baselineVariant, baselineVariant);
    const baselinePromptBundle = buildPromptBundle(caseDefinition, baselineStrategy);
    const baselineRuntimeContext = resolve_runtime_context(
      {
        ...baselinePromptBundle.runtime_context,
        platform_context_root: settings.platformContextRoot,
        workspace_context_root: workspace,
      },
      workspace,
    );
    const baselineSystemPromptText = get_system_prompt_text(
      build_system_prompt_event({
        runtime_context: baselineRuntimeContext,
        working_dir: workspace,
      }).payload,
    );
    expect(baselineSystemPromptText).toContain("[BEGIN context from button-usage]");
    expect(baselineSystemPromptText).not.toContain("<name>button-usage</name>");

    const availableStrategy = resolveStrategyBundleByVariant(availableVariant, baselineVariant);
    const availablePromptBundle = buildPromptBundle(caseDefinition, availableStrategy);
    const availableRuntimeContext = resolve_runtime_context(
      {
        ...availablePromptBundle.runtime_context,
        platform_context_root: settings.platformContextRoot,
        workspace_context_root: workspace,
      },
      workspace,
    );
    const availableSystemPromptText = get_system_prompt_text(
      build_system_prompt_event({
        runtime_context: availableRuntimeContext,
        working_dir: workspace,
      }).payload,
    );
    expect(availableSystemPromptText).toContain("<name>button-usage</name>");
    expect(availableSystemPromptText).not.toContain("[BEGIN context from button-usage]");

    const triggeredStrategy = resolveStrategyBundleByVariant(triggeredVariant, baselineVariant);
    const triggeredPromptBundle = buildPromptBundle(caseDefinition, triggeredStrategy);
    const triggeredRuntimeContext = resolve_runtime_context(
      {
        ...triggeredPromptBundle.runtime_context,
        platform_context_root: settings.platformContextRoot,
        workspace_context_root: workspace,
      },
      workspace,
    );
    const triggeredSystemPromptEvent = build_system_prompt_event({
      runtime_context: triggeredRuntimeContext,
      working_dir: workspace,
    });
    const triggeredSystemPromptText = get_system_prompt_text(triggeredSystemPromptEvent.payload);
    expect(triggeredSystemPromptText).toContain("<name>button-usage</name>");
    expect(triggeredSystemPromptText).not.toContain("[BEGIN context from button-usage]");

    const triggeredUserEvent = build_user_message_event({
      raw_text: "Replace the native button in button-lab with the shared Button from packages/ui/Button.",
      prior_events: [triggeredSystemPromptEvent],
      runtime_context: triggeredRuntimeContext,
      skip_skill_names: [],
    });
    const triggeredUserText = get_message_text(triggeredUserEvent.payload);
    expect(triggeredUserText).toContain("Replace a native `<button>` with the shared `Button` component");
  });
});
