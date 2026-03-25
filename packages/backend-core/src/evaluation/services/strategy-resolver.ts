import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeVariantChangedAxes,
  getBusinessContextProfile,
  getContextPackage,
  getMcpProfile,
  getModelProfile,
  getPromptVersion,
  getSandboxProfile,
  getSessionContextPolicy,
  getVariant,
} from "../catalog/service";
import { settings } from "../../config/settings";
import type {
  BusinessFineTuningVariantDefinition,
  ResolvedContextPackage,
  ResolvedStrategyBundle,
  StrategyVariantDefinition,
  VariantDefinition,
} from "../schemas";

function normalizeSkills(variant: StrategyVariantDefinition, skillMode: string): string[] {
  if (skillMode === "off") {
    return [];
  }
  const skills =
    variant.case_bindings.skill_subset.length > 0
      ? variant.enabled_skills.filter((skill) => variant.case_bindings.skill_subset.includes(skill))
      : variant.enabled_skills;
  return Array.from(new Set(skills)).sort();
}

function normalizeContextPackages(variant: BusinessFineTuningVariantDefinition): string[] {
  // package_subset is the business fine-tuning equivalent of skill_subset: it narrows a versioned
  // dependency list for a specific case without mutating the variant's baseline package graph.
  const refs =
    variant.case_bindings.package_subset.length > 0
      ? variant.context_packages.filter((ref) => variant.case_bindings.package_subset.includes(ref))
      : variant.context_packages;
  return Array.from(new Set(refs)).sort();
}

function buildFingerprint(input: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function readPackageEntry(entry: string): string {
  const target = entry.startsWith("/")
    ? entry
    : resolve(settings.evaluationAssetsRoot, entry);
  return readFileSync(target, "utf-8").trim();
}

function resolveContextPackages(
  variant: BusinessFineTuningVariantDefinition,
): ResolvedContextPackage[] {
  // Packages are resolved eagerly so the run snapshot contains both the manifest coordinates and
  // the exact entry content that was made available to the executor for this variant replica.
  return normalizeContextPackages(variant).map((ref) => {
    const manifest = getContextPackage(ref);
    return {
      ...manifest,
      content: readPackageEntry(manifest.entry),
    };
  });
}

export function resolveStrategyBundleByVariant(
  variant: VariantDefinition,
  baseline?: VariantDefinition | null,
): ResolvedStrategyBundle {
  const prompt = getPromptVersion(variant.prompt_version);
  const model = getModelProfile(variant.model_profile);
  const businessContext = getBusinessContextProfile(variant.business_context_profile);
  const sessionContext = getSessionContextPolicy(variant.session_context_policy);
  const mcp = getMcpProfile(variant.mcp_profile);
  const sandbox = getSandboxProfile(variant.sandbox_profile);
  const skills =
    variant.kind === "strategy" ? normalizeSkills(variant, businessContext.skill_mode) : [];
  const resolvedContextPackages =
    variant.kind === "business_fine_tuning" ? resolveContextPackages(variant) : [];
  const changedAxis =
    baseline == null || baseline.id === variant.id
      ? "baseline"
      : computeVariantChangedAxes(baseline, variant)[0] ?? "baseline";

  const fingerprint = buildFingerprint({
    prompt_version: variant.prompt_version,
    model_profile: variant.model_profile,
    business_context_profile: variant.business_context_profile,
    session_context_policy: variant.session_context_policy,
    mcp_profile: variant.mcp_profile,
    sandbox_profile: variant.sandbox_profile,
    skills,
    context_packages:
      variant.kind === "business_fine_tuning" ? normalizeContextPackages(variant) : [],
    case_bindings: variant.case_bindings,
  });

  return {
    variant_id: variant.id,
    kind: variant.kind,
    description: variant.description,
    changed_axis: changedAxis,
    prompt_version: variant.prompt_version,
    model_profile: variant.model_profile,
    business_context_profile: variant.business_context_profile,
    session_context_policy: variant.session_context_policy,
    mcp_profile: variant.mcp_profile,
    sandbox_profile: variant.sandbox_profile,
    skills,
    context_packages:
      variant.kind === "business_fine_tuning" ? normalizeContextPackages(variant) : [],
    resolved_context_packages: resolvedContextPackages,
    case_bindings: variant.case_bindings,
    prompt,
    model,
    business_context: businessContext,
    session_context: sessionContext,
    mcp,
    sandbox,
    fingerprint,
  };
}

export function resolveStrategyBundle(
  variantId: string,
  options?: { baselineVariantId?: string | null },
): ResolvedStrategyBundle {
  const variant = getVariant(variantId);
  const baseline =
    options?.baselineVariantId != null
      ? getVariant(options.baselineVariantId)
      : variantId === "baseline-v1" || variantId === "ft-baseline-v1"
        ? variant
        : null;
  return resolveStrategyBundleByVariant(variant, baseline);
}

export function compareResolvedStrategies(
  baseline: ResolvedStrategyBundle,
  variant: ResolvedStrategyBundle,
): string[] {
  const axes: Array<[string, unknown, unknown]> = [
    ["kind", baseline.kind, variant.kind],
    ["prompt", baseline.prompt_version, variant.prompt_version],
    ["model", baseline.model_profile, variant.model_profile],
    ["business_context", baseline.business_context_profile, variant.business_context_profile],
    ["session_context", baseline.session_context_policy, variant.session_context_policy],
  ];
  if (baseline.kind === "strategy" && variant.kind === "strategy") {
    axes.push(["skills", baseline.skills, variant.skills]);
  }
  if (baseline.kind === "business_fine_tuning" && variant.kind === "business_fine_tuning") {
    // Business fine-tuning compares explicit package coordinates instead of repo-local skill ids so
    // the changed axis reflects versioned business assets rather than incidental file edits.
    axes.push(["context_packages", baseline.context_packages, variant.context_packages]);
  }
  return axes
    .filter(([, left, right]) => JSON.stringify(left) !== JSON.stringify(right))
    .map(([axis]) => axis);
}

export function assertComparableStrategies(
  baseline: ResolvedStrategyBundle,
  variant: ResolvedStrategyBundle,
): string[] {
  if (baseline.mcp_profile !== variant.mcp_profile) {
    throw new Error(
      `Variant '${variant.variant_id}' must keep mcp_profile fixed relative to baseline '${baseline.variant_id}'`,
    );
  }
  if (baseline.sandbox_profile !== variant.sandbox_profile) {
    throw new Error(
      `Variant '${variant.variant_id}' must keep sandbox_profile fixed relative to baseline '${baseline.variant_id}'`,
    );
  }
  return compareResolvedStrategies(baseline, variant);
}
