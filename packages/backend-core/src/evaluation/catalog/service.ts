import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import YAML from "js-yaml";

import { settings } from "../../config/settings";
import type {
  BusinessContextProfileDefinition,
  BusinessFineTuningCaseBindingsConfig,
  CaseDefinition,
  CatalogCaseSummary,
  CatalogVariantSummary,
  CodeStateRefConfig,
  CompletionCheckConfig,
  ContextPackageManifest,
  McpProfileDefinition,
  MetadataConfig,
  ModelProfileDefinition,
  PromptVersionDefinition,
  RequirementBundleConfig,
  SandboxProfileDefinition,
  StrategyCaseBindingsConfig,
  ScopeConfig,
  SessionContextPolicyDefinition,
  VariantDefinition,
  VariantKind,
} from "../schemas";

function collectFiles(root: string, extension: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const results: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = resolve(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectFiles(fullPath, extension));
    } else if (fullPath.endsWith(extension)) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function resolveEnvPlaceholders(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => {
    return process.env[key] ?? "";
  });
}

function normalizeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readYaml<T>(path: string): T {
  return (YAML.load(readFileSync(path, "utf-8")) ?? {}) as T;
}

function projectRelative(path: string): string {
  return path.replace(`${settings.evaluationAssetsRoot}/`, "");
}

function normalizeCodeStateRef(raw: Record<string, unknown>): CodeStateRefConfig {
  return {
    repo_path: String(raw.repo_path ?? "").trim(),
    ref: String(raw.ref ?? "").trim(),
    install: normalizeStringArray(raw.install),
    env: Object.fromEntries(
      Object.entries((raw.env ?? {}) as Record<string, unknown>).map(([key, value]) => [
        key,
        String(value ?? ""),
      ]),
    ),
  };
}

function normalizeRequirementBundle(raw: Record<string, unknown>): RequirementBundleConfig {
  return {
    primary_requirement_doc: String(raw.primary_requirement_doc ?? "").trim(),
    acceptance_criteria: normalizeStringArray(raw.acceptance_criteria),
    supporting_docs: normalizeStringArray(raw.supporting_docs),
    api_contracts: normalizeStringArray(raw.api_contracts),
    design_notes: normalizeStringArray(raw.design_notes),
    screenshots: normalizeStringArray(raw.screenshots),
  };
}

function normalizeEffectivePromptVersion(
  kind: VariantKind,
  configuredPromptVersion: string,
): string {
  if (kind !== "business_fine_tuning") {
    return configuredPromptVersion;
  }

  if (
    configuredPromptVersion &&
    configuredPromptVersion !== settings.businessFineTuningDefaultPromptVersion
  ) {
    throw new Error(
      `Business fine-tuning variants must keep prompt_version fixed to '${settings.businessFineTuningDefaultPromptVersion}', received '${configuredPromptVersion}'`,
    );
  }

  return settings.businessFineTuningDefaultPromptVersion;
}

function normalizeCompletionChecks(value: unknown): CompletionCheckConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item, index) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    return {
      name: String(raw.name ?? `check_${index + 1}`).trim(),
      type:
        raw.type === "script" ||
        raw.type === "artifact_exists" ||
        raw.type === "artifact_contains" ||
        raw.type === "keyword_present"
          ? raw.type
          : "shell",
      command: typeof raw.command === "string" ? raw.command.trim() : undefined,
      path: typeof raw.path === "string" ? raw.path.trim() : undefined,
      contains: typeof raw.contains === "string" ? raw.contains : undefined,
      keyword: typeof raw.keyword === "string" ? raw.keyword : undefined,
    };
  });
}

function normalizeScope(raw: Record<string, unknown>): ScopeConfig {
  return {
    editable_scope: normalizeStringArray(raw.editable_scope),
    protected_scope: normalizeStringArray(raw.protected_scope),
  };
}

function normalizeMetadata(raw: Record<string, unknown>, fallbackDifficulty = ""): MetadataConfig {
  return {
    owner: String(raw.owner ?? "").trim(),
    tags: normalizeStringArray(raw.tags),
  };
}

function normalizeStrategyCaseBindings(rawValue: unknown): StrategyCaseBindingsConfig {
  const raw = (rawValue ?? {}) as Record<string, unknown>;
  const resourceFilters = (raw.resource_filters ?? {}) as Record<string, unknown>;
  return {
    resource_filters: {
      include: normalizeStringArray(resourceFilters.include),
      exclude: normalizeStringArray(resourceFilters.exclude),
    },
    skill_subset: normalizeStringArray(raw.skill_subset),
    task_notes: normalizeStringArray(raw.task_notes),
  };
}

function normalizeBusinessFineTuningCaseBindings(
  rawValue: unknown,
): BusinessFineTuningCaseBindingsConfig {
  const raw = (rawValue ?? {}) as Record<string, unknown>;
  const resourceFilters = (raw.resource_filters ?? {}) as Record<string, unknown>;
  return {
    resource_filters: {
      include: normalizeStringArray(resourceFilters.include),
      exclude: normalizeStringArray(resourceFilters.exclude),
    },
    package_subset: normalizeStringArray(raw.package_subset),
    task_notes: normalizeStringArray(raw.task_notes),
  };
}

function normalizeCase(raw: Record<string, unknown>, sourcePath: string): CaseDefinition {
  const codeStateRef = normalizeCodeStateRef((raw.code_state_ref ?? {}) as Record<string, unknown>);
  const requirementBundle = normalizeRequirementBundle(
    (raw.requirement_bundle ?? {}) as Record<string, unknown>,
  );
  const scope = normalizeScope((raw.scope ?? {}) as Record<string, unknown>);
  const budgets = (raw.budgets ?? {}) as Record<string, unknown>;
  const metadata = (raw.metadata ?? {}) as Record<string, unknown>;

  return {
    id: String(raw.id ?? "").trim(),
    name: String(raw.name ?? "").trim(),
    project: String(raw.project ?? "").trim(),
    code_state_ref: codeStateRef,
    requirement_bundle: requirementBundle,
    // Case-level prompt additions are only consumed by business fine-tuning mode.
    // They let the platform keep one default prompt strategy while still attaching
    // task-specific execution guidance as structured assets owned by the case.
    additional_prompt_docs: normalizeStringArray(raw.additional_prompt_docs),
    task_family: String(raw.task_family ?? "").trim(),
    difficulty: String(raw.difficulty ?? "").trim(),
    tuning_axis: String(raw.tuning_axis ?? "").trim(),
    context_mode: String(raw.context_mode ?? "").trim(),
    completion_checks: normalizeCompletionChecks(raw.completion_checks),
    expected_artifacts: normalizeStringArray(raw.expected_artifacts),
    expected_keywords: normalizeStringArray(raw.expected_keywords),
    expected_skills: normalizeStringArray(raw.expected_skills),
    expected_tools: normalizeStringArray(raw.expected_tools),
    scope,
    budgets: {
      max_steps: Number(budgets.max_steps ?? 30),
      max_wall_clock_seconds: Number(budgets.max_wall_clock_seconds ?? 900),
      max_cost_usd: Number(budgets.max_cost_usd ?? 1.5),
    },
    metadata: normalizeMetadata(metadata),
    source_path: projectRelative(sourcePath),
  };
}

function normalizeVariant(raw: Record<string, unknown>, sourcePath: string): VariantDefinition {
  const kind = raw.kind === "business_fine_tuning" ? "business_fine_tuning" : "strategy";
  const configuredPromptVersion = String(raw.prompt_version ?? "").trim();
  const promptVersion = normalizeEffectivePromptVersion(kind, configuredPromptVersion);
  const base = {
    id: String(raw.id ?? "").trim(),
    kind,
    description: String(raw.description ?? "").trim(),
    prompt_version: promptVersion,
    model_profile: String(raw.model_profile ?? "").trim(),
    business_context_profile: String(raw.business_context_profile ?? "").trim(),
    session_context_policy: String(raw.session_context_policy ?? "").trim(),
    mcp_profile: String(raw.mcp_profile ?? "").trim(),
    sandbox_profile: String(raw.sandbox_profile ?? "").trim(),
    source_path: projectRelative(sourcePath),
  } as const;

  if (kind === "business_fine_tuning") {
    return {
      ...base,
      kind,
      context_packages: normalizeStringArray(raw.context_packages),
      case_bindings: normalizeBusinessFineTuningCaseBindings(raw.case_bindings),
    };
  }

  return {
    ...base,
    kind,
    enabled_skills: normalizeStringArray(raw.enabled_skills),
    case_bindings: normalizeStrategyCaseBindings(raw.case_bindings),
  };
}

function normalizePromptVersion(raw: Record<string, unknown>, sourcePath: string): PromptVersionDefinition {
  const taskCard = (raw.task_card ?? {}) as Record<string, unknown>;
  const finishChecklist = (raw.finish_checklist ?? {}) as Record<string, unknown>;
  return {
    id: String(raw.id ?? "").trim(),
    system_template: String(raw.system_template ?? "").trim(),
    system_message_suffix_template: String(raw.system_message_suffix_template ?? "").trim(),
    task_card: {
      enabled: normalizeBoolean(taskCard.enabled),
      include_sections: normalizeStringArray(taskCard.include_sections),
    },
    finish_checklist: {
      enabled: normalizeBoolean(finishChecklist.enabled),
      items: normalizeStringArray(finishChecklist.items),
    },
    source_path: projectRelative(sourcePath),
  };
}

function normalizeModelProfile(raw: Record<string, unknown>, sourcePath: string): ModelProfileDefinition {
  return {
    id: String(raw.id ?? "").trim(),
    provider: typeof raw.provider === "string" ? resolveEnvPlaceholders(raw.provider) : undefined,
    name: resolveEnvPlaceholders(String(raw.name ?? "").trim()),
    effort: typeof raw.effort === "string" ? raw.effort : undefined,
    temperature:
      typeof raw.temperature === "number" ? raw.temperature : normalizeNumber(raw.temperature) ?? null,
    token_budget: normalizeNumber(raw.token_budget) ?? null,
    source_path: projectRelative(sourcePath),
  };
}

function normalizeBusinessContextProfile(
  raw: Record<string, unknown>,
  sourcePath: string,
): BusinessContextProfileDefinition {
  const repoMap = (raw.repo_map ?? {}) as Record<string, unknown>;
  return {
    id: String(raw.id ?? "").trim(),
    load_workspace_context: normalizeBoolean(raw.load_workspace_context),
    repo_map: {
      enabled: normalizeBoolean(repoMap.enabled),
      source: typeof repoMap.source === "string" ? repoMap.source.trim() : undefined,
      max_chars: normalizeNumber(repoMap.max_chars) ?? null,
    },
    include_primary_requirement: normalizeBoolean(raw.include_primary_requirement, true),
    include_supporting_docs: normalizeBoolean(raw.include_supporting_docs),
    include_api_contracts: normalizeBoolean(raw.include_api_contracts),
    include_design_notes: normalizeBoolean(raw.include_design_notes),
    include_screenshots: normalizeBoolean(raw.include_screenshots),
    skill_mode:
      raw.skill_mode === "off" || raw.skill_mode === "recommended" ? raw.skill_mode : "selected",
    source_path: projectRelative(sourcePath),
  };
}

function normalizeSessionContextPolicy(
  raw: Record<string, unknown>,
  sourcePath: string,
): SessionContextPolicyDefinition {
  const condenser = (raw.condenser ?? {}) as Record<string, unknown>;
  const failureMemory = (raw.recent_failure_memory ?? {}) as Record<string, unknown>;
  return {
    id: String(raw.id ?? "").trim(),
    condenser: {
      type: String(condenser.type ?? "none"),
      max_events: normalizeNumber(condenser.max_events),
      keep_first: normalizeNumber(condenser.keep_first),
      keep_recent: normalizeNumber(condenser.keep_recent),
    },
    recent_failure_memory: {
      enabled: normalizeBoolean(failureMemory.enabled),
      max_chars: normalizeNumber(failureMemory.max_chars) ?? null,
    },
    source_path: projectRelative(sourcePath),
  };
}

function normalizeMcpProfile(raw: Record<string, unknown>, sourcePath: string): McpProfileDefinition {
  return {
    id: String(raw.id ?? "").trim(),
    allowed: normalizeStringArray(raw.allowed),
    default_disabled: normalizeBoolean(raw.default_disabled, true),
    source_path: projectRelative(sourcePath),
  };
}

function normalizeSandboxProfile(
  raw: Record<string, unknown>,
  sourcePath: string,
): SandboxProfileDefinition {
  return {
    id: String(raw.id ?? "").trim(),
    workspace_root: typeof raw.workspace_root === "string" ? raw.workspace_root.trim() : null,
    tool_allowlist: normalizeStringArray(raw.tool_allowlist),
    approval_policy: String(raw.approval_policy ?? "default").trim(),
    source_path: projectRelative(sourcePath),
  };
}

function normalizeContextPackageManifest(
  raw: Record<string, unknown>,
  sourcePath: string,
): ContextPackageManifest {
  const name = String(raw.name ?? "").trim();
  const version = String(raw.version ?? "").trim();
  const kind = raw.kind === "repo-policy" ? "repo-policy" : "skill";
  const ref = `${kind}/${name}@${version}`;
  return {
    ref,
    name,
    version,
    kind,
    entry: String(raw.entry ?? "").trim(),
    description: String(raw.description ?? "").trim(),
    owner: String(raw.owner ?? "").trim(),
    tags: normalizeStringArray(raw.tags),
    source_path: projectRelative(sourcePath),
  };
}

function loadProfileFile<T>(kind: string, id: string, normalizer: (raw: Record<string, unknown>, path: string) => T): T {
  const path = resolve(settings.evaluationAssetsRoot, "profiles", kind, `${id}.yaml`);
  if (!existsSync(path)) {
    throw new Error(`Unable to resolve ${kind} profile '${id}'`);
  }
  return normalizer(readYaml<Record<string, unknown>>(path), path);
}

function collectVariantFiles(): string[] {
  return collectFiles(resolve(settings.evaluationAssetsRoot, "variants"), ".yaml");
}

function findVariantDefinitionPath(variantId: string): string | null {
  return collectVariantFiles().find((path) => normalizeVariant(readYaml<Record<string, unknown>>(path), path).id === variantId) ?? null;
}

function resolveVariantSkillSet(variant: VariantDefinition): string[] {
  if (variant.kind !== "strategy") {
    return [];
  }
  if (variant.case_bindings.skill_subset.length === 0) {
    return [...variant.enabled_skills];
  }
  const allowed = new Set(variant.case_bindings.skill_subset);
  return variant.enabled_skills.filter((skill) => allowed.has(skill));
}

function resolveVariantPackageSet(variant: VariantDefinition): string[] {
  if (variant.kind !== "business_fine_tuning") {
    return [];
  }
  if (variant.case_bindings.package_subset.length === 0) {
    return [...variant.context_packages];
  }
  const allowed = new Set(variant.case_bindings.package_subset);
  return variant.context_packages.filter((ref) => allowed.has(ref));
}

function baselineIdForKind(kind: VariantKind): string {
  return kind === "business_fine_tuning" ? "ft-baseline-v1" : "baseline-v1";
}

function findBaseline(definitions: VariantDefinition[], kind: VariantKind): VariantDefinition | null {
  return (
    definitions.find((item) => item.kind === kind && item.id === baselineIdForKind(kind)) ??
    definitions.find((item) => item.kind === kind) ??
    null
  );
}

export function getPromptVersion(id: string): PromptVersionDefinition {
  return loadProfileFile("prompt_versions", id, normalizePromptVersion);
}

export function getModelProfile(id: string): ModelProfileDefinition {
  return loadProfileFile("model_profiles", id, normalizeModelProfile);
}

export function getBusinessContextProfile(id: string): BusinessContextProfileDefinition {
  return loadProfileFile("business_context_profiles", id, normalizeBusinessContextProfile);
}

export function getSessionContextPolicy(id: string): SessionContextPolicyDefinition {
  return loadProfileFile("session_context_policies", id, normalizeSessionContextPolicy);
}

export function getMcpProfile(id: string): McpProfileDefinition {
  return loadProfileFile("mcp_profiles", id, normalizeMcpProfile);
}

export function getSandboxProfile(id: string): SandboxProfileDefinition {
  return loadProfileFile("sandbox_profiles", id, normalizeSandboxProfile);
}

export function getContextPackage(ref: string): ContextPackageManifest {
  const [kindAndName, version] = ref.split("@");
  const [kind, ...nameParts] = kindAndName.split("/");
  const name = nameParts.join("/");
  if (!kind || !name || !version) {
    throw new Error(`Invalid context package ref '${ref}'`);
  }
  const manifestPath = resolve(
    settings.evaluationAssetsRoot,
    "context-packages",
    kind,
    name,
    version,
    "package.yaml",
  );
  if (!existsSync(manifestPath)) {
    throw new Error(`Unable to resolve context package '${ref}'`);
  }
  const manifest = normalizeContextPackageManifest(readYaml<Record<string, unknown>>(manifestPath), manifestPath);
  if (manifest.ref !== ref) {
    throw new Error(`Context package manifest '${manifestPath}' resolved to '${manifest.ref}', expected '${ref}'`);
  }
  return manifest;
}

export function listCases(): CatalogCaseSummary[] {
  return collectFiles(resolve(settings.evaluationAssetsRoot, "cases"), ".yaml").map((path) => {
    const definition = normalizeCase(readYaml<Record<string, unknown>>(path), path);
    return {
      id: definition.id,
      name: definition.name,
      project: definition.project,
      task_family: definition.task_family,
      tuning_axis: definition.tuning_axis,
      difficulty: definition.difficulty,
      context_mode: definition.context_mode,
      source_path: definition.source_path ?? projectRelative(path),
    };
  });
}

export function listVariants(): CatalogVariantSummary[] {
  const paths = collectVariantFiles();
  const definitions = paths.map((path) => normalizeVariant(readYaml<Record<string, unknown>>(path), path));
  const baselines = new Map<VariantKind, VariantDefinition | null>([
    ["strategy", findBaseline(definitions, "strategy")],
    ["business_fine_tuning", findBaseline(definitions, "business_fine_tuning")],
  ]);
  return definitions.map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    description: definition.description,
    changed_axis:
      (baselines.get(definition.kind)
        ? computeVariantChangedAxes(baselines.get(definition.kind)!, definition)[0]
        : null) ?? "baseline",
    prompt_version: definition.prompt_version,
    model_profile: definition.model_profile,
    business_context_profile: definition.business_context_profile,
    session_context_policy: definition.session_context_policy,
    package_refs: definition.kind === "business_fine_tuning" ? resolveVariantPackageSet(definition) : [],
    source_path:
      definition.source_path ??
      projectRelative(resolve(settings.evaluationAssetsRoot, "variants", `${definition.id}.yaml`)),
  }));
}

export function getCase(caseId: string): CaseDefinition {
  for (const path of collectFiles(resolve(settings.evaluationAssetsRoot, "cases"), ".yaml")) {
    const definition = normalizeCase(readYaml<Record<string, unknown>>(path), path);
    if (definition.id === caseId) {
      return definition;
    }
  }
  throw new Error(`Unable to resolve case '${caseId}'`);
}

export function getVariant(variantId: string): VariantDefinition {
  const path = findVariantDefinitionPath(variantId);
  if (!path || !existsSync(path)) {
    throw new Error(`Unable to resolve variant '${variantId}'`);
  }
  return normalizeVariant(readYaml<Record<string, unknown>>(path), path);
}

export function computeVariantChangedAxes(
  baseline: VariantDefinition,
  variant: VariantDefinition,
): string[] {
  const axes: Array<[string, unknown, unknown]> = [
    ["kind", baseline.kind, variant.kind],
    ["prompt", baseline.prompt_version, variant.prompt_version],
    ["model", baseline.model_profile, variant.model_profile],
    ["business_context", baseline.business_context_profile, variant.business_context_profile],
    ["session_context", baseline.session_context_policy, variant.session_context_policy],
  ];

  if (baseline.kind === "strategy" && variant.kind === "strategy") {
    axes.push(["skills", resolveVariantSkillSet(baseline), resolveVariantSkillSet(variant)]);
  }

  if (baseline.kind === "business_fine_tuning" && variant.kind === "business_fine_tuning") {
    axes.push(["context_packages", resolveVariantPackageSet(baseline), resolveVariantPackageSet(variant)]);
  }

  return axes
    .filter(([, left, right]) => JSON.stringify(left) !== JSON.stringify(right))
    .map(([axis]) => axis);
}
