import type { ExperimentRead, RunRead } from "../schemas";
import {
  buildExperimentReportPaths,
  writeArtifactJson,
  writeArtifactText,
} from "../artifacts/manager";
import { ACTIVE_EVALUATION_RUN_STATUSES, FAILED_LIKE_STATUSES } from "../models";
import { listCases } from "../catalog/service";
import { dedupeSkillRecords, readSkillObservations } from "./skill-telemetry";

function incrementCounter(target: Map<string, number>, keys: string[]) {
  for (const key of keys) {
    target.set(key, (target.get(key) ?? 0) + 1);
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean)),
  ).sort();
}

function buildRateMatrix(
  groups: Map<string, RunRead[]>,
  variants: string[],
): Record<string, { count: number; variants: Record<string, number> }> {
  return Object.fromEntries(
    [...groups.entries()].map(([group, groupRuns]) => [
      group,
      {
        count: groupRuns.length,
        variants: Object.fromEntries(
          variants.map((variantId) => {
            const scoped = groupRuns.filter((run) => run.variant_id === variantId);
            const successes = scoped.filter((run) => Boolean((run.result_payload as Record<string, unknown>).success))
              .length;
            return [
              variantId,
              scoped.length === 0 ? 0 : Number((successes / scoped.length).toFixed(4)),
            ];
          }),
        ),
      },
    ]),
  );
}

function runSucceeded(run: RunRead): boolean {
  return Boolean((run.result_payload as Record<string, unknown>).success);
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function averageRate(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function buildCaseVariantAggregates(
  experiment: ExperimentRead,
  runs: RunRead[],
): Array<Record<string, unknown>> {
  const baselineByCase = new Map<string, RunRead[]>();
  const grouped = new Map<string, RunRead[]>();

  for (const run of runs) {
    const key = `${run.case_id}::${run.variant_id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), run]);
    if (run.variant_id === experiment.baseline_variant_id) {
      baselineByCase.set(run.case_id, [...(baselineByCase.get(run.case_id) ?? []), run]);
    }
  }

  return [...grouped.entries()]
    .map(([key, groupRuns]) => {
      // Replica-aware aggregates are the bridge between raw run evidence and experiment-level
      // conclusions. They let us talk about stable pass rate and regressions for one case/variant
      // pair before folding everything into the top-level report.
      const sorted = [...groupRuns].sort((left, right) => left.replica_index - right.replica_index);
      const [caseId, variantId] = key.split("::");
      const successes = sorted.filter(runSucceeded).length;
      const passRate = sorted.length === 0 ? 0 : Number((successes / sorted.length).toFixed(4));
      const baselineRuns = baselineByCase.get(caseId) ?? [];
      const baselinePassRate =
        baselineRuns.length === 0
          ? 0
          : Number((baselineRuns.filter(runSucceeded).length / baselineRuns.length).toFixed(4));
      const rootCauseDistribution = new Map<string, number>();
      for (const run of sorted) {
        const rootCauses = Array.isArray((run.result_payload as Record<string, unknown>).suspected_root_cause)
          ? ((run.result_payload as Record<string, unknown>).suspected_root_cause as string[])
          : [];
        incrementCounter(rootCauseDistribution, rootCauses);
      }
      return {
        case_id: caseId,
        variant_id: variantId,
        replica_count: sorted.length,
        pass_rate: passRate,
        stable_pass_rate: sorted.length > 0 && successes === sorted.length ? 1 : 0,
        first_pass_rate: sorted.length > 0 && runSucceeded(sorted[0]) ? 1 : 0,
        regression_rate_vs_baseline: Number(Math.max(baselinePassRate - passRate, 0).toFixed(4)),
        root_cause_distribution: Object.fromEntries(rootCauseDistribution.entries()),
      };
    })
    .sort((left, right) =>
      `${String(left.case_id)}:${String(left.variant_id)}`.localeCompare(
        `${String(right.case_id)}:${String(right.variant_id)}`,
      ),
    );
}

function buildPackageFunnelSummary(runs: RunRead[]) {
  const summary = new Map<
    string,
    {
      configured_count: number;
      loaded_count: number;
      read_count: number;
      activated_count: number;
      success_count: number;
      success_when_activated_count: number;
    }
  >();

  for (const run of runs) {
    const resultPayload = run.result_payload as Record<string, unknown>;
    const observations = Array.isArray(resultPayload.package_observations)
      ? (resultPayload.package_observations as Array<Record<string, unknown>>)
      : [];
    const success = runSucceeded(run);
    for (const item of observations) {
      const ref = String(item.ref ?? "");
      if (!ref) {
        continue;
      }
      const next = summary.get(ref) ?? {
        configured_count: 0,
        loaded_count: 0,
        read_count: 0,
        activated_count: 0,
        success_count: 0,
        success_when_activated_count: 0,
      };
      if (item.configured === true) {
        next.configured_count += 1;
      }
      if (item.loaded === true) {
        next.loaded_count += 1;
      }
      if (item.read === true) {
        next.read_count += 1;
      }
      if (item.activated === true) {
        next.activated_count += 1;
      }
      if (success) {
        next.success_count += 1;
      }
      if (success && item.activated === true) {
        next.success_when_activated_count += 1;
      }
      summary.set(ref, next);
    }
  }

  return Object.fromEntries(
    [...summary.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([ref, item]) => [
      ref,
      {
        ...item,
        // The legacy field name keeps the API stable, but the current semantics are intentionally
        // lightweight: "hit" now means "activated" for this package version.
        package_version_hit_rate:
          item.configured_count === 0 ? 0 : Number((item.activated_count / item.configured_count).toFixed(4)),
        package_version_success_rate:
          item.configured_count === 0 ? 0 : Number((item.success_count / item.configured_count).toFixed(4)),
      },
    ]),
  );
}

function buildSkillHitSummary(runs: RunRead[]) {
  const summary = new Map<
    string,
    {
      configured_count: number;
      loaded_count: number;
      hit_count: number;
      success_when_hit_count: number;
      source: "strategy_skill" | "skill_package";
    }
  >();

  for (const run of runs) {
    const resultPayload = run.result_payload as Record<string, unknown>;
    const skillObservations = readSkillObservations(resultPayload);
    const success = runSucceeded(run);

    for (const skill of skillObservations.loaded_skills) {
      const key = `skill:${skill}`;
      const next = summary.get(key) ?? {
        configured_count: 0,
        loaded_count: 0,
        hit_count: 0,
        success_when_hit_count: 0,
        source: "strategy_skill" as const,
      };
      next.configured_count += 1;
      next.loaded_count += 1;
      summary.set(key, next);
    }

    for (const skill of skillObservations.activated_skills) {
      const key = `skill:${skill}`;
      const next = summary.get(key) ?? {
        configured_count: 0,
        loaded_count: 0,
        hit_count: 0,
        success_when_hit_count: 0,
        source: "strategy_skill" as const,
      };
      next.hit_count += 1;
      if (success) {
        next.success_when_hit_count += 1;
      }
      summary.set(key, next);
    }

    for (const ref of skillObservations.configured_skill_packages) {
      const next = summary.get(ref) ?? {
        configured_count: 0,
        loaded_count: 0,
        hit_count: 0,
        success_when_hit_count: 0,
        source: "skill_package" as const,
      };
      next.configured_count += 1;
      summary.set(ref, next);
    }

    for (const ref of skillObservations.loaded_skill_packages) {
      const next = summary.get(ref) ?? {
        configured_count: 0,
        loaded_count: 0,
        hit_count: 0,
        success_when_hit_count: 0,
        source: "skill_package" as const,
      };
      next.loaded_count += 1;
      summary.set(ref, next);
    }

    for (const ref of skillObservations.activated_skill_packages) {
      const next = summary.get(ref) ?? {
        configured_count: 0,
        loaded_count: 0,
        hit_count: 0,
        success_when_hit_count: 0,
        source: "skill_package" as const,
      };
      next.hit_count += 1;
      if (success) {
        next.success_when_hit_count += 1;
      }
      summary.set(ref, next);
    }
  }

  return Object.fromEntries(
    [...summary.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [
      key,
      {
        ...value,
        hit_rate:
          value.loaded_count === 0 ? 0 : Number((value.hit_count / value.loaded_count).toFixed(4)),
        success_when_hit_rate:
          value.hit_count === 0
            ? 0
            : Number((value.success_when_hit_count / value.hit_count).toFixed(4)),
      },
    ]),
  );
}

function buildRootCauseDistribution(runs: RunRead[]) {
  const counts = new Map<string, number>();
  for (const run of runs) {
    const rootCauses = Array.isArray((run.result_payload as Record<string, unknown>).suspected_root_cause)
      ? ((run.result_payload as Record<string, unknown>).suspected_root_cause as string[])
      : [];
    incrementCounter(counts, rootCauses);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function buildSkillTelemetryCatalog(runs: RunRead[]) {
  const strategySkillRecords = dedupeSkillRecords(
    runs.flatMap((run) => {
      const resultPayload = run.result_payload as Record<string, unknown>;
      return readSkillObservations(resultPayload).strategy_skill_records;
    }),
  );
  const packageSkillRecords = dedupeSkillRecords(
    runs.flatMap((run) => {
      const resultPayload = run.result_payload as Record<string, unknown>;
      return readSkillObservations(resultPayload).package_skill_records;
    }),
  );

  return {
    strategy_skill_records: strategySkillRecords,
    package_skill_records: packageSkillRecords,
  };
}

export function buildAggregatePayload(experiment: ExperimentRead, runs: RunRead[]) {
  const caseMap = new Map(listCases().map((item) => [item.id, item]));
  const runsByVariant = new Map<string, RunRead[]>();
  const failureBucketCounts = new Map<string, number>();
  const gapBucketCounts = new Map<string, number>();
  const runsByFamily = new Map<string, RunRead[]>();
  const runsByAxis = new Map<string, RunRead[]>();
  const designSnapshot =
    (experiment.aggregate_payload?.design_snapshot as Record<string, unknown> | undefined) ?? {};

  // Grouping by case family and tuning axis is shared by both modes. Business fine-tuning adds
  // replica-aware and package-aware rollups on top of the same experiment aggregate.
  for (const run of runs) {
    const bucket = runsByVariant.get(run.variant_id) ?? [];
    bucket.push(run);
    runsByVariant.set(run.variant_id, bucket);

    incrementCounter(failureBucketCounts, run.failure_bucket);
    incrementCounter(gapBucketCounts, run.suspected_gap);

    const caseSummary = caseMap.get(run.case_id);
    const familyKey = caseSummary?.task_family ?? "unknown";
    const axisKey = caseSummary?.tuning_axis ?? "unknown";
    runsByFamily.set(familyKey, [...(runsByFamily.get(familyKey) ?? []), run]);
    runsByAxis.set(axisKey, [...(runsByAxis.get(axisKey) ?? []), run]);
  }

  const variantIds = [...runsByVariant.keys()];
  const variantSummaries = variantIds.map((variantId) => {
    const variantRuns = runsByVariant.get(variantId) ?? [];
    const successes = variantRuns.filter((run) => Boolean((run.result_payload as Record<string, unknown>).success))
      .length;
    const skillObservations = variantRuns.map((run) =>
      readSkillObservations(run.result_payload as Record<string, unknown>),
    );
    const strategySnapshot =
      (variantRuns[0]?.strategy_snapshot as Record<string, unknown> | undefined) ?? {};
    const localFailureCounts = new Map<string, number>();
    const localGapCounts = new Map<string, number>();
    for (const run of variantRuns) {
      incrementCounter(localFailureCounts, run.failure_bucket);
      incrementCounter(localGapCounts, run.suspected_gap);
    }

    return {
      variant_id: variantId,
      kind: String(strategySnapshot.kind ?? (experiment.mode === "business_fine_tuning" ? "business_fine_tuning" : "strategy")),
      changed_axis: String(strategySnapshot.changed_axis ?? (variantId === experiment.baseline_variant_id ? "baseline" : "unknown")),
      prompt_version: String(strategySnapshot.prompt_version ?? ""),
      model_profile: String(strategySnapshot.model_profile ?? ""),
      business_context_profile: String(strategySnapshot.business_context_profile ?? ""),
      session_context_policy: String(strategySnapshot.session_context_policy ?? ""),
      package_refs: Array.isArray(strategySnapshot.context_packages)
        ? (strategySnapshot.context_packages as string[])
        : [],
      run_count: variantRuns.length,
      success_rate:
        variantRuns.length === 0 ? 0 : Number((successes / variantRuns.length).toFixed(4)),
      avg_duration_seconds:
        variantRuns.length === 0
          ? 0
          : Number(
              (
                variantRuns.reduce(
                  (sum, run) => sum + Number((run.metrics.wall_clock_seconds as number | undefined) ?? 0),
                  0,
                ) / variantRuns.length
              ).toFixed(4),
            ),
      avg_cost_usd:
        variantRuns.length === 0
          ? 0
          : Number(
              (
                variantRuns.reduce(
                  (sum, run) => sum + Number((run.metrics.cost_usd as number | undefined) ?? 0),
                  0,
                ) / variantRuns.length
              ).toFixed(4),
            ),
      avg_loaded_skills:
        variantRuns.length === 0
          ? 0
          : Number(
              (
                skillObservations.reduce((sum, item) => sum + item.loaded_skills.length, 0) /
                variantRuns.length
              ).toFixed(4),
            ),
      avg_activated_skills:
        variantRuns.length === 0
          ? 0
          : Number(
              (
                skillObservations.reduce((sum, item) => sum + item.activated_skills.length, 0) /
                variantRuns.length
              ).toFixed(4),
            ),
      failure_bucket_counts: Object.fromEntries(localFailureCounts.entries()),
      gap_bucket_counts: Object.fromEntries(localGapCounts.entries()),
    };
  });

  const overallSuccessCount = runs.filter((run) => Boolean((run.result_payload as Record<string, unknown>).success))
    .length;
  const recommendations: string[] = [];
  const skillHitSummary = buildSkillHitSummary(runs);
  const skillTelemetry = buildSkillTelemetryCatalog(runs);
  if ((gapBucketCounts.get("context_gap") ?? 0) > 0) {
    recommendations.push("Prioritize business_context_profile and session_context_policy tuning for the failing case families.");
  }
  if ((gapBucketCounts.get("skills_gap") ?? 0) > 0) {
    recommendations.push("Expand or refine enabled_skills and case_bindings.skill_subset for skill-sensitive cases.");
  }
  if ((gapBucketCounts.get("prompt_gap") ?? 0) > 0) {
    recommendations.push("Compare prompt versions with stronger task-card and finish-checklist structure.");
  }
  if ((gapBucketCounts.get("model_gap") ?? 0) > 0) {
    recommendations.push("Run the same matrix with a stronger model_profile before changing other axes.");
  }

  const aggregate = {
    design_snapshot: designSnapshot,
    experiment_id: experiment.id,
    mode: experiment.mode,
    replica_count: experiment.replica_count,
    name: experiment.name,
    status: experiment.status,
    case_count: experiment.case_ids.length,
    variant_count: 1 + experiment.comparison_variant_ids.length,
    run_count: runs.length,
    overall_success_rate:
      runs.length === 0 ? 0 : Number((overallSuccessCount / runs.length).toFixed(4)),
    variant_summaries: variantSummaries,
    pass_rate_by_family: buildRateMatrix(runsByFamily, variantIds),
    pass_rate_by_axis: buildRateMatrix(runsByAxis, variantIds),
    failure_bucket_counts: Object.fromEntries([...failureBucketCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    gap_bucket_counts: Object.fromEntries([...gapBucketCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    skill_hit_summary: skillHitSummary,
    skill_telemetry: skillTelemetry,
    tuning_recommendations: recommendations,
  };

  if (experiment.mode === "business_fine_tuning") {
    const caseVariantSummaries = buildCaseVariantAggregates(experiment, runs);
    const businessVariantSummaries = variantSummaries.map((item) => {
      const scoped = caseVariantSummaries.filter(
        (summary) => String(summary.variant_id ?? "") === String(item.variant_id ?? ""),
      );
      return {
        ...item,
        replica_count: scoped.reduce(
          (max, summary) => Math.max(max, Number(summary.replica_count ?? 0)),
          0,
        ),
        case_group_count: scoped.length,
        first_pass_rate: averageRate(
          scoped.map((summary) => Number(summary.first_pass_rate ?? 0)),
        ),
        stable_pass_rate: averageRate(
          scoped.map((summary) => Number(summary.stable_pass_rate ?? 0)),
        ),
      };
    });
    const packageFunnelSummary = buildPackageFunnelSummary(runs);
    const stablePassRate =
      caseVariantSummaries.length === 0
        ? 0
        : Number(
            (
              caseVariantSummaries.reduce(
                (sum, item) => sum + Number(item.stable_pass_rate ?? 0),
                0,
              ) / caseVariantSummaries.length
            ).toFixed(4),
          );
    return {
      ...aggregate,
      variant_summaries: businessVariantSummaries,
      stable_pass_rate: stablePassRate,
      case_variant_summaries: caseVariantSummaries,
      package_funnel_summary: packageFunnelSummary,
      package_version_hit_rate: Object.fromEntries(
        Object.entries(packageFunnelSummary).map(([ref, value]) => [
          ref,
          Number((value as Record<string, unknown>).package_version_hit_rate ?? 0),
        ]),
      ),
      package_version_success_rate: Object.fromEntries(
        Object.entries(packageFunnelSummary).map(([ref, value]) => [
          ref,
          Number((value as Record<string, unknown>).package_version_success_rate ?? 0),
        ]),
      ),
      skill_hit_summary: skillHitSummary,
      root_cause_distribution: buildRootCauseDistribution(runs),
      side_effect_summary: {
        regressed_case_variant_count: caseVariantSummaries.filter(
          (item) => Number(item.regression_rate_vs_baseline ?? 0) > 0,
        ).length,
      },
    };
  }

  return aggregate;
}

export function renderMarkdownReport(aggregate: Record<string, unknown>): string {
  const isBusinessFineTuning = String(aggregate.mode ?? "") === "business_fine_tuning";
  const lines = [
    `# Experiment Report: ${String(aggregate.name ?? "")}`,
    "",
    `- Status: ${String(aggregate.status ?? "")}`,
    `- Overall success rate: ${(Number(aggregate.overall_success_rate ?? 0) * 100).toFixed(2)}%`,
    `- Runs: ${String(aggregate.run_count ?? 0)}`,
  ];
  if (isBusinessFineTuning) {
    lines.push(
      `- Stable pass rate: ${(Number(aggregate.stable_pass_rate ?? 0) * 100).toFixed(2)}%`,
    );
  }
  lines.push("");
  if (isBusinessFineTuning) {
    lines.push(
      "| Variant | Axis | Replica | Success Rate | First Pass Rate | Stable Pass Rate | Loaded Skills | Activated Skills | Avg Duration | Avg Cost |",
      "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    );
  } else {
    lines.push(
      "| Variant | Axis | Success Rate | Loaded Skills | Activated Skills | Avg Duration | Avg Cost |",
      "|---|---|---:|---:|---:|---:|---:|",
    );
  }
  for (const item of (aggregate.variant_summaries ?? []) as Array<Record<string, unknown>>) {
    if (isBusinessFineTuning) {
      lines.push(
        `| ${String(item.variant_id ?? "")} | ${String(item.changed_axis ?? "")} | ${Number(
          item.replica_count ?? 0,
        ).toFixed(0)} | ${(Number(item.success_rate ?? 0) * 100).toFixed(2)}% | ${(Number(
          item.first_pass_rate ?? 0,
        ) * 100).toFixed(2)}% | ${(Number(item.stable_pass_rate ?? 0) * 100).toFixed(2)}% | ${Number(
          item.avg_loaded_skills ?? 0,
        ).toFixed(2)} | ${Number(item.avg_activated_skills ?? 0).toFixed(2)} | ${Number(
          item.avg_duration_seconds ?? 0,
        ).toFixed(2)}s | $${Number(item.avg_cost_usd ?? 0).toFixed(2)} |`,
      );
      continue;
    }
    lines.push(
      `| ${String(item.variant_id ?? "")} | ${String(item.changed_axis ?? "")} | ${(Number(
        item.success_rate ?? 0,
      ) * 100).toFixed(2)}% | ${Number(item.avg_loaded_skills ?? 0).toFixed(2)} | ${Number(
        item.avg_activated_skills ?? 0,
      ).toFixed(2)} | ${Number(item.avg_duration_seconds ?? 0).toFixed(2)}s | $${Number(
        item.avg_cost_usd ?? 0,
      ).toFixed(2)} |`,
    );
  }

  const caseVariantSummaries = Array.isArray(aggregate.case_variant_summaries)
    ? (aggregate.case_variant_summaries as Array<Record<string, unknown>>)
    : [];
  if (isBusinessFineTuning && caseVariantSummaries.length > 0) {
    lines.push(
      "",
      "## Replica Stability",
      "| Case | Variant | Replica | Pass Rate | First Pass Rate | Stable Pass Rate | Regression vs Baseline |",
      "|---|---|---:|---:|---:|---:|---:|",
    );
    for (const item of caseVariantSummaries) {
      lines.push(
        `| ${escapeMarkdownCell(String(item.case_id ?? ""))} | ${escapeMarkdownCell(
          String(item.variant_id ?? ""),
        )} | ${Number(item.replica_count ?? 0).toFixed(0)} | ${(Number(item.pass_rate ?? 0) * 100).toFixed(
          2,
        )}% | ${(Number(item.first_pass_rate ?? 0) * 100).toFixed(2)}% | ${(
          Number(item.stable_pass_rate ?? 0) * 100
        ).toFixed(2)}% | ${(Number(item.regression_rate_vs_baseline ?? 0) * 100).toFixed(2)}% |`,
      );
    }
  }

  lines.push("", "## Failure Buckets");
  for (const [key, count] of Object.entries(
    (aggregate.failure_bucket_counts ?? {}) as Record<string, number>,
  )) {
    lines.push(`- ${key}: ${count}`);
  }

  lines.push("", "## Gap Buckets");
  for (const [key, count] of Object.entries(
    (aggregate.gap_bucket_counts ?? {}) as Record<string, number>,
  )) {
    lines.push(`- ${key}: ${count}`);
  }

  const skillHitSummary = (aggregate.skill_hit_summary ?? {}) as Record<string, Record<string, unknown>>;
  if (Object.keys(skillHitSummary).length > 0) {
    lines.push("", "## Skill Hits");
    lines.push("| Skill | Loaded | Activated | Activation Rate |");
    lines.push("|---|---:|---:|---:|");
    for (const [key, value] of Object.entries(skillHitSummary).sort(([a], [b]) => a.localeCompare(b))) {
      const loaded = Number(value.loaded_count ?? 0);
      const activated = Number(value.hit_count ?? 0);
      const rate = Number(value.hit_rate ?? 0);
      lines.push(
        `| ${escapeMarkdownCell(String(key))} | ${Number.isFinite(loaded) ? loaded : 0} | ${
          Number.isFinite(activated) ? activated : 0
        } | ${(Number.isFinite(rate) ? rate * 100 : 0).toFixed(2)}% |`,
      );
    }
  }

  if (Array.isArray(aggregate.tuning_recommendations) && aggregate.tuning_recommendations.length > 0) {
    lines.push("", "## Recommendations");
    for (const item of aggregate.tuning_recommendations as string[]) {
      lines.push(`- ${item}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderCsvReport(aggregate: Record<string, unknown>): string {
  const rows = [[
    "variant_id",
    "changed_axis",
    "replica_count",
    "success_rate",
    "first_pass_rate",
    "stable_pass_rate",
    "avg_loaded_skills",
    "avg_activated_skills",
    "avg_duration_seconds",
    "avg_cost_usd",
  ].join(",")];
  for (const item of (aggregate.variant_summaries ?? []) as Array<Record<string, unknown>>) {
    rows.push(
      [
        String(item.variant_id ?? ""),
        String(item.changed_axis ?? ""),
        String(item.replica_count ?? 0),
        String(item.success_rate ?? 0),
        String(item.first_pass_rate ?? 0),
        String(item.stable_pass_rate ?? 0),
        String(item.avg_loaded_skills ?? 0),
        String(item.avg_activated_skills ?? 0),
        String(item.avg_duration_seconds ?? 0),
        String(item.avg_cost_usd ?? 0),
      ].join(","),
    );
  }
  return `${rows.join("\n")}\n`;
}

export async function writeExperimentReports(experiment: ExperimentRead): Promise<{
  status: string;
  completedRuns: number;
  failedRuns: number;
  aggregatePayload: Record<string, unknown>;
  reportPaths: Record<string, string>;
  finishedAt: Date | null;
}> {
  const completedRuns = experiment.runs.filter((run) => run.status === "completed").length;
  const failedRuns = experiment.runs.filter((run) => FAILED_LIKE_STATUSES.has(run.status)).length;
  const hasActiveRuns = experiment.runs.some((run) => ACTIVE_EVALUATION_RUN_STATUSES.has(run.status));

  let status = "queued";
  let aggregatePayload: Record<string, unknown> = {
    ...experiment.aggregate_payload,
  };
  let reportPaths: Record<string, string> = {};
  let finishedAt: Date | null = null;

  if (hasActiveRuns) {
    status = "running";
  } else if (
    experiment.runs.length > 0 &&
    experiment.runs.every((run) => run.status === "completed" || FAILED_LIKE_STATUSES.has(run.status))
  ) {
    status = failedRuns > 0 ? "failed" : "completed";
    aggregatePayload = {
      ...experiment.aggregate_payload,
      ...buildAggregatePayload(experiment, experiment.runs),
      status,
    };
    reportPaths = buildExperimentReportPaths(experiment.id);
    await writeArtifactJson("experiment", experiment.id, "aggregate_json", reportPaths.aggregate_json, aggregatePayload);
    await writeArtifactText(
      "experiment",
      experiment.id,
      "report_markdown",
      reportPaths.report_markdown,
      renderMarkdownReport(aggregatePayload),
    );
    await writeArtifactText(
      "experiment",
      experiment.id,
      "report_csv",
      reportPaths.report_csv,
      renderCsvReport(aggregatePayload),
    );
    finishedAt = new Date();
  }

  return {
    status,
    completedRuns,
    failedRuns,
    aggregatePayload,
    reportPaths,
    finishedAt,
  };
}
