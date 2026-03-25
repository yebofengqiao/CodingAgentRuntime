import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getCase,
  getVariant,
} from "@openhands-rl/backend-core/evaluation/catalog";
import { createMockExecutorResult } from "@openhands-rl/backend-core/evaluation/executors/mock";
import {
  buildAggregatePayload,
  renderMarkdownReport,
} from "@openhands-rl/backend-core/evaluation/services/report-generator";
import type { JsonRecord } from "@openhands-rl/backend-core/shared";
import { buildPromptBundle } from "@openhands-rl/backend-core/evaluation/services/context-assembler";
import { buildSkillObservations } from "@openhands-rl/backend-core/evaluation/services/skill-telemetry";
import { resolveStrategyBundleByVariant } from "@openhands-rl/backend-core/evaluation/services/strategy-resolver";
import type {
  ExperimentRead,
  PackageObservation,
  RunRead,
} from "@openhands-rl/backend-core/evaluation/schemas";

const tempPaths: string[] = [];

function createTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempPaths.push(directory);
  return directory;
}

function createWorkspaceHandle(workspacePath: string) {
  return {
    runId: "test-run",
    repoPath: workspacePath,
    workspacePath,
    ref: "HEAD",
    env: {},
  };
}

function createPackageObservations(
  refs: string[],
  options?: {
    activatedRefs?: string[];
    alwaysOnRefs?: string[];
  },
): PackageObservation[] {
  const activatedRefs = new Set(options?.activatedRefs ?? []);
  const alwaysOnRefs = new Set(options?.alwaysOnRefs ?? []);
  return refs.map((ref) => {
    const activated = activatedRefs.has(ref) || alwaysOnRefs.has(ref);
    return {
      ref,
      configured: true,
      loaded: true,
      read: alwaysOnRefs.has(ref) ? true : activated ? true : false,
      activated,
      activation_source: alwaysOnRefs.has(ref)
        ? "always_on"
        : activated
          ? "prompt_trigger"
          : null,
    };
  });
}

afterEach(() => {
  while (tempPaths.length > 0) {
    rmSync(tempPaths.pop()!, { recursive: true, force: true });
  }
});

describe("evaluation skill telemetry alignment", () => {
  it("fails fast when a strategy skill is missing from local assets", () => {
    const caseDefinition = getCase("FE_BUTTON_01");
    const baselineVariant = getVariant("baseline-v1");
    const variant = getVariant("button-trigger-v1");
    const strategy = {
      ...resolveStrategyBundleByVariant(variant, baselineVariant),
      skills: ["missing-local-skill"],
    };

    expect(() => buildPromptBundle(caseDefinition, strategy)).toThrow(
      "Evaluation skill 'missing-local-skill' could not be resolved from local assets.",
    );
  });

  it("fails fast when a fine-tuning package points to an unsupported task skill", () => {
    const caseDefinition = getCase("FE_BUTTON_01");
    const baselineVariant = getVariant("ft-button-skill-baseline-v1");
    const variant = getVariant("ft-button-skill-v2");
    const strategy = resolveStrategyBundleByVariant(variant, baselineVariant);

    const skillRoot = join(createTempDir("evaluation-task-skill-"), "task-skill");
    mkdirSync(skillRoot, { recursive: true });
    const skillPath = join(skillRoot, "SKILL.md");
    writeFileSync(
      skillPath,
      [
        "---",
        "name: task-skill",
        "description: Invalid evaluation task skill.",
        "inputs:",
        "  required_arg:",
        "    type: string",
        "---",
        "",
        "# task-skill",
        "",
        "This should fail in evaluation prompt assembly.",
        "",
      ].join("\n"),
      "utf-8",
    );

    const invalidRef = "skill/task-skill@1.0.0";
    const invalidStrategy = {
      ...strategy,
      context_packages: [invalidRef],
      resolved_context_packages: [
        {
          ref: invalidRef,
          name: "task-skill",
          version: "1.0.0",
          kind: "skill" as const,
          entry: skillPath,
          description: "Invalid task skill package",
          owner: "test",
          tags: ["skill", "test"],
          source_path: skillPath,
          content: readFileSync(skillPath, "utf-8").trim(),
        },
      ],
    };

    expect(() => buildPromptBundle(caseDefinition, invalidStrategy)).toThrow(
      "Task skills with inputs are not supported in runtime-core",
    );
  });

  it("preserves structured skill records in prompt bundles, snapshots, and aggregate reports", () => {
    const caseDefinition = getCase("FE_BUTTON_01");

    const strategyBaseline = getVariant("baseline-v1");
    const strategyVariant = getVariant("button-progressive-v1");
    const strategyBundle = resolveStrategyBundleByVariant(strategyVariant, strategyBaseline);
    const strategyPromptBundle = buildPromptBundle(caseDefinition, strategyBundle);
    const strategySkillRecord = strategyPromptBundle.loaded_skill_records.find(
      (record) => record.name === "button-progressive",
    );

    expect(strategyPromptBundle.loaded_skills).toContain("button-progressive");
    expect(strategySkillRecord).toMatchObject({
      name: "button-progressive",
      source_kind: "strategy_skill",
      source_ref: "button-progressive",
      is_agent_skills_format: true,
    });
    expect(strategySkillRecord.trigger).toMatchObject({
      type: "keyword",
      keywords: expect.arrayContaining(["button-lab", "shared Button"]),
    });
    expect(strategySkillRecord.resources?.references).toContain(
      "references/button-usage-playbook.md",
    );

    const packageBaseline = getVariant("ft-button-skill-baseline-v1");
    const packageVariant = getVariant("ft-button-skill-v2");
    const packageBundle = resolveStrategyBundleByVariant(packageVariant, packageBaseline);
    const packagePromptBundle = buildPromptBundle(caseDefinition, packageBundle);
    const workspacePath = createTempDir("evaluation-skill-snapshot-");
    const mockResult = createMockExecutorResult(
      caseDefinition,
      packageBundle,
      packagePromptBundle,
      createWorkspaceHandle(workspacePath),
    );

    expect(packagePromptBundle.loaded_skills).toContain("button-usage");
    expect(
      packagePromptBundle.loaded_skill_records.find(
        (record) => record.name === "button-usage" && record.package_kind === "skill",
      ),
    ).toMatchObject({
      source_kind: "context_package",
      source_ref: "skill/button-usage@2.0.0",
      is_agent_skills_format: true,
    });
    expect(
      packagePromptBundle.loaded_skill_records.find(
        (record) => record.name === "frontend-base" && record.package_kind === "repo-policy",
      ),
    ).toMatchObject({
      source_kind: "context_package",
      trigger: null,
    });

    const runtimeContextSnapshot = mockResult.runtime_context_snapshot as {
      resolved_runtime_context: { skills: Array<Record<string, unknown>> };
      package_telemetry: { loaded_skill_records: Array<Record<string, unknown>> };
    };
    const buttonUsageSnapshot = runtimeContextSnapshot.resolved_runtime_context.skills.find(
      (skill) => skill.name === "button-usage",
    );

    expect(buttonUsageSnapshot).toMatchObject({
      name: "button-usage",
      license: null,
      compatibility: null,
      is_agent_skills_format: true,
      resources: null,
    });
    expect(runtimeContextSnapshot.package_telemetry.loaded_skill_records).toHaveLength(
      packagePromptBundle.loaded_skill_records.length,
    );

    const packageObservations = createPackageObservations(packagePromptBundle.loaded_packages, {
      alwaysOnRefs: ["repo-policy/frontend-base@1.0.0"],
    });
    const skillObservations = buildSkillObservations(packagePromptBundle, {
      skill_events: [],
      package_observations: packageObservations,
    });

    expect(skillObservations.loaded_skills).toContain("button-usage");
    expect(skillObservations.activated_skill_packages).not.toContain("skill/button-usage@2.0.0");
    expect(skillObservations.package_skill_records).toHaveLength(
      packagePromptBundle.loaded_skill_records.length,
    );

    const resultPayload = {
      success: true,
      configured_packages: packagePromptBundle.configured_packages,
      loaded_packages: packagePromptBundle.loaded_packages,
      skill_observations: skillObservations,
      package_observations: packageObservations,
    } satisfies JsonRecord;
    const run = {
      id: "run-1",
      experiment_id: "exp-1",
      case_id: caseDefinition.id,
      variant_id: packageVariant.id,
      replica_index: 1,
      status: "completed",
      metrics: {
        wall_clock_seconds: 0,
        cost_usd: 0,
      },
      judge_payload: {},
      failure_bucket: [],
      suspected_gap: [],
      suspected_root_cause: [],
      strategy_snapshot: {
        kind: "business_fine_tuning",
        changed_axis: "baseline",
        prompt_version: packageBundle.prompt_version,
        model_profile: packageBundle.model_profile,
        business_context_profile: packageBundle.business_context_profile,
        session_context_policy: packageBundle.session_context_policy,
        context_packages: packageBundle.context_packages,
      },
      artifact_paths: {},
      result_payload: resultPayload,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
    } satisfies RunRead;
    const experiment = {
      id: "exp-1",
      name: "skill-telemetry",
      mode: "business_fine_tuning",
      status: "completed",
      replica_count: 1,
      case_ids: [caseDefinition.id],
      baseline_variant_id: packageBaseline.id,
      comparison_variant_ids: [packageVariant.id],
      total_runs: 1,
      completed_runs: 1,
      failed_runs: 0,
      aggregate_payload: {
        design_snapshot: {},
      },
      report_paths: {},
      runs: [run],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
    } satisfies ExperimentRead;

    const aggregate = buildAggregatePayload(experiment, [run]) as Record<string, unknown>;
    const skillHitSummary = aggregate.skill_hit_summary as Record<string, Record<string, unknown>>;
    const skillTelemetry = aggregate.skill_telemetry as {
      strategy_skill_records: Array<Record<string, unknown>>;
      package_skill_records: Array<Record<string, unknown>>;
    };

    expect(skillHitSummary["skill/button-usage@2.0.0"]).toMatchObject({
      source: "skill_package",
      configured_count: 1,
      loaded_count: 1,
      hit_count: 0,
    });
    expect(skillTelemetry.strategy_skill_records).toEqual([]);
    expect(
      skillTelemetry.package_skill_records.some(
        (record) =>
          record.name === "button-usage" &&
          record.package_kind === "skill" &&
          record.is_agent_skills_format === true,
      ),
    ).toBe(true);
    expect(
      skillTelemetry.package_skill_records.some(
        (record) => record.name === "frontend-base" && record.package_kind === "repo-policy",
      ),
    ).toBe(true);
  });

  it("marks triggered package skills as activated when the user message matches keywords", () => {
    const caseDefinition = getCase("FE_BUTTON_01");
    const baselineVariant = getVariant("ft-button-skill-baseline-v1");
    const triggeredVariant = getVariant("ft-button-skill-v3");
    const strategy = resolveStrategyBundleByVariant(triggeredVariant, baselineVariant);
    const promptBundle = buildPromptBundle(caseDefinition, strategy);
    const workspacePath = createTempDir("evaluation-triggered-package-");
    const result = createMockExecutorResult(
      caseDefinition,
      strategy,
      promptBundle,
      createWorkspaceHandle(workspacePath),
    );

    const skillObservations = buildSkillObservations(promptBundle, {
      skill_events: result.skill_events,
      package_observations: result.package_observations,
    });

    expect(skillObservations.activated_skills).toContain("button-usage");
    expect(skillObservations.activated_skill_packages).toContain("skill/button-usage@3.0.0");
    expect(result.package_observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: "skill/button-usage@3.0.0",
          loaded: true,
          read: true,
          activated: true,
          activation_source: "prompt_trigger",
        }),
      ]),
    );
  });

  it("counts repo-context legacy skill packages as activated because they are always-on", () => {
    const caseDefinition = getCase("FE_BUTTON_01");
    const baselineVariant = getVariant("ft-button-skill-baseline-v1");
    const strategy = resolveStrategyBundleByVariant(baselineVariant, baselineVariant);
    const promptBundle = buildPromptBundle(caseDefinition, strategy);
    const workspacePath = createTempDir("evaluation-repo-context-skill-");
    const result = createMockExecutorResult(
      caseDefinition,
      strategy,
      promptBundle,
      createWorkspaceHandle(workspacePath),
    );

    expect(
      promptBundle.loaded_skill_records.find(
        (record) => record.name === "button-usage" && record.source_ref === "skill/button-usage@1.0.0",
      ),
    ).toMatchObject({
      trigger: null,
      is_agent_skills_format: false,
    });

    const skillObservations = buildSkillObservations(promptBundle, {
      skill_events: result.skill_events,
      package_observations: result.package_observations,
    });

    expect(skillObservations.activated_skills).toContain("button-usage");
    expect(skillObservations.activated_skill_packages).toContain("skill/button-usage@1.0.0");
    expect(result.package_observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: "skill/button-usage@1.0.0",
          loaded: true,
          read: true,
          activated: true,
          activation_source: "always_on",
        }),
      ]),
    );
  });

  it("renders replica stability metrics in markdown reports for business fine-tuning runs", () => {
    const caseDefinition = getCase("FE_BUTTON_01");
    const run = (replicaIndex: number) =>
      ({
        id: `run-${replicaIndex}`,
        experiment_id: "exp-stability",
        case_id: caseDefinition.id,
        variant_id: "ft-button-skill-v4",
        replica_index: replicaIndex,
        status: "completed",
        metrics: {
          wall_clock_seconds: 12,
          cost_usd: 0,
        },
        judge_payload: {},
        failure_bucket: [],
        suspected_gap: [],
        suspected_root_cause: [],
        strategy_snapshot: {
          kind: "business_fine_tuning",
          changed_axis: "context_packages",
          prompt_version: "base-v1",
          model_profile: "gpt-5-medium",
          business_context_profile: "frontend-domain-v1",
          session_context_policy: "session-basic-v1",
          context_packages: ["skill/button-usage@4.0.0"],
        },
        artifact_paths: {},
        result_payload: {
          success: true,
          skill_observations: {
            loaded_skills: ["button-usage"],
            activated_skills: ["button-usage"],
            configured_skill_packages: ["skill/button-usage@4.0.0"],
            loaded_skill_packages: ["skill/button-usage@4.0.0"],
            activated_skill_packages: ["skill/button-usage@4.0.0"],
            observed_skill_hits: ["button-usage", "skill/button-usage@4.0.0"],
            strategy_skill_records: [],
            package_skill_records: [],
          },
          package_observations: createPackageObservations(["skill/button-usage@4.0.0"], {
            activatedRefs: ["skill/button-usage@4.0.0"],
          }),
        },
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        started_at: null,
        finished_at: null,
      }) satisfies RunRead;

    const experiment = {
      id: "exp-stability",
      name: "replica-stability",
      mode: "business_fine_tuning",
      status: "completed",
      replica_count: 3,
      case_ids: [caseDefinition.id],
      baseline_variant_id: "ft-button-skill-v2",
      comparison_variant_ids: ["ft-button-skill-v4"],
      total_runs: 3,
      completed_runs: 3,
      failed_runs: 0,
      aggregate_payload: {
        design_snapshot: {},
      },
      report_paths: {},
      runs: [run(1), run(2), run(3)],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
    } satisfies ExperimentRead;

    const aggregate = buildAggregatePayload(experiment, experiment.runs) as Record<string, unknown>;
    const markdown = renderMarkdownReport(aggregate);

    expect(markdown).toContain("- Stable pass rate: 100.00%");
    expect(markdown).toContain(
      "| Variant | Axis | Replica | Success Rate | First Pass Rate | Stable Pass Rate | Loaded Skills | Activated Skills | Avg Duration | Avg Cost |",
    );
    expect(markdown).toContain("## Replica Stability");
    expect(markdown).toContain(
      "| FE_BUTTON_01 | ft-button-skill-v4 | 3 | 100.00% | 100.00% | 100.00% | 0.00% |",
    );
  });
});
