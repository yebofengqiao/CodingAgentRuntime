import type {
  RuntimeContextConfig,
  SkillResources,
  SkillTrigger,
} from "@openhands-rl/runtime-core/runtime";

import type { JsonRecord } from "../shared";

export type ExperimentMode = "strategy" | "business_fine_tuning";

export type VariantKind = "strategy" | "business_fine_tuning";

export type CatalogCaseSummary = {
  id: string;
  name: string;
  project: string;
  task_family: string;
  tuning_axis: string;
  difficulty: string;
  context_mode: string;
  source_path: string;
};

export type CatalogVariantSummary = {
  id: string;
  kind: VariantKind;
  description: string;
  changed_axis: string;
  prompt_version: string;
  model_profile: string;
  business_context_profile: string;
  session_context_policy: string;
  package_refs: string[];
  source_path: string;
};

export type CodeStateRefConfig = {
  repo_path: string;
  ref: string;
  install: string[];
  env: Record<string, string>;
};

export type RequirementBundleConfig = {
  primary_requirement_doc: string;
  acceptance_criteria: string[];
  supporting_docs: string[];
  api_contracts: string[];
  design_notes: string[];
  screenshots: string[];
};

export type CompletionCheckType =
  | "shell"
  | "script"
  | "artifact_exists"
  | "artifact_contains"
  | "keyword_present";

export type CompletionCheckConfig = {
  name: string;
  type: CompletionCheckType;
  command?: string;
  path?: string;
  contains?: string;
  keyword?: string;
};

export type ScopeConfig = {
  editable_scope: string[];
  protected_scope: string[];
};

export type BudgetConfig = {
  max_steps: number;
  max_wall_clock_seconds: number;
  max_cost_usd: number;
};

export type MetadataConfig = {
  owner: string;
  tags: string[];
};

export type CaseDefinition = {
  id: string;
  name: string;
  project: string;
  code_state_ref: CodeStateRefConfig;
  requirement_bundle: RequirementBundleConfig;
  additional_prompt_docs: string[];
  task_family: string;
  difficulty: string;
  tuning_axis: string;
  context_mode: string;
  completion_checks: CompletionCheckConfig[];
  expected_artifacts: string[];
  expected_keywords: string[];
  expected_skills: string[];
  expected_tools: string[];
  scope: ScopeConfig;
  budgets: BudgetConfig;
  metadata: MetadataConfig;
  source_path?: string;
};

export type PromptVersionDefinition = {
  id: string;
  system_template: string;
  system_message_suffix_template: string;
  task_card: {
    enabled: boolean;
    include_sections: string[];
  };
  finish_checklist: {
    enabled: boolean;
    items: string[];
  };
  source_path?: string;
};

export type ModelProfileDefinition = {
  id: string;
  provider?: string;
  name: string;
  effort?: string;
  temperature?: number | null;
  token_budget?: number | null;
  source_path?: string;
};

export type RepoMapConfig = {
  enabled: boolean;
  source?: string | null;
  max_chars?: number | null;
};

export type BusinessContextProfileDefinition = {
  id: string;
  load_workspace_context: boolean;
  repo_map: RepoMapConfig;
  include_primary_requirement: boolean;
  include_supporting_docs: boolean;
  include_api_contracts: boolean;
  include_design_notes: boolean;
  include_screenshots: boolean;
  skill_mode: "off" | "selected" | "recommended";
  source_path?: string;
};

export type SessionContextPolicyDefinition = {
  id: string;
  condenser: {
    type: "none" | "event_summary_v1" | string;
    max_events?: number;
    keep_first?: number;
    keep_recent?: number;
  };
  recent_failure_memory: {
    enabled: boolean;
    max_chars?: number | null;
  };
  source_path?: string;
};

export type McpProfileDefinition = {
  id: string;
  allowed: string[];
  default_disabled: boolean;
  source_path?: string;
};

export type SandboxProfileDefinition = {
  id: string;
  workspace_root?: string | null;
  tool_allowlist: string[];
  approval_policy: string;
  source_path?: string;
};

export type StrategyCaseBindingsConfig = {
  resource_filters: {
    include: string[];
    exclude: string[];
  };
  skill_subset: string[];
  task_notes: string[];
};

export type BusinessFineTuningCaseBindingsConfig = {
  resource_filters: {
    include: string[];
    exclude: string[];
  };
  package_subset: string[];
  task_notes: string[];
};

export type CaseBindingsConfig = StrategyCaseBindingsConfig | BusinessFineTuningCaseBindingsConfig;

export type ContextPackageManifest = {
  ref: string;
  name: string;
  version: string;
  kind: "repo-policy" | "skill";
  entry: string;
  description: string;
  owner: string;
  tags: string[];
  source_path?: string;
};

export type StrategyVariantDefinition = {
  id: string;
  kind: "strategy";
  description: string;
  prompt_version: string;
  enabled_skills: string[];
  model_profile: string;
  business_context_profile: string;
  session_context_policy: string;
  mcp_profile: string;
  sandbox_profile: string;
  case_bindings: StrategyCaseBindingsConfig;
  source_path?: string;
};

export type BusinessFineTuningVariantDefinition = {
  id: string;
  kind: "business_fine_tuning";
  description: string;
  prompt_version: string;
  model_profile: string;
  business_context_profile: string;
  session_context_policy: string;
  mcp_profile: string;
  sandbox_profile: string;
  context_packages: string[];
  case_bindings: BusinessFineTuningCaseBindingsConfig;
  source_path?: string;
};

export type VariantDefinition = StrategyVariantDefinition | BusinessFineTuningVariantDefinition;

export type ResolvedContextPackage = ContextPackageManifest & {
  content: string;
};

export type ResolvedStrategyBundle = {
  variant_id: string;
  kind: VariantKind;
  description: string;
  changed_axis: string;
  prompt_version: string;
  model_profile: string;
  business_context_profile: string;
  session_context_policy: string;
  mcp_profile: string;
  sandbox_profile: string;
  skills: string[];
  context_packages: string[];
  resolved_context_packages: ResolvedContextPackage[];
  case_bindings: CaseBindingsConfig;
  prompt: PromptVersionDefinition;
  model: ModelProfileDefinition;
  business_context: BusinessContextProfileDefinition;
  session_context: SessionContextPolicyDefinition;
  mcp: McpProfileDefinition;
  sandbox: SandboxProfileDefinition;
  fingerprint: string;
};

export type SkillSnapshot = {
  name: string;
  source: string | null;
  trigger: SkillTrigger;
  description: string | null;
  license: string | null;
  compatibility: string | null;
  metadata: Record<string, string> | null;
  allowed_tools: string[] | null;
  mcp_tools: Record<string, unknown> | null;
  is_agent_skills_format: boolean;
  resources: SkillResources | null;
};

export type SkillSourceKind = "strategy_skill" | "context_package";

export type SkillRecord = SkillSnapshot & {
  source_kind: SkillSourceKind;
  source_ref: string | null;
  source_path: string | null;
  package_kind: ResolvedContextPackage["kind"] | null;
};

export type SkillObservationPayload = {
  loaded_skills: string[];
  activated_skills: string[];
  configured_skill_packages: string[];
  loaded_skill_packages: string[];
  activated_skill_packages: string[];
  observed_skill_hits: string[];
  strategy_skill_records: SkillRecord[];
  package_skill_records: SkillRecord[];
};

export type PromptBundle = {
  base_system_prompt: string;
  system_message_suffix: string;
  user_message: string;
  runtime_context: RuntimeContextConfig;
  task_card: Record<string, unknown>;
  case_context: JsonRecord;
  evaluation_contract: string;
  loaded_skills: string[];
  loaded_skill_records: SkillRecord[];
  configured_packages: string[];
  loaded_packages: string[];
  resolved_strategy: ResolvedStrategyBundle;
};

export type CommandOutcome = {
  cmd: string;
  exit_code: number;
  duration_seconds: number;
  stdout: string;
  stderr: string;
};

export type ScopeAudit = {
  changed_files: string[];
  protected_violations: string[];
  outside_editable_scope: string[];
  scope_ok: boolean;
};

export type CompletionCheckOutcome = {
  name: string;
  type: CompletionCheckType;
  passed: boolean;
  details: string;
  exit_code: number;
};

export type JudgeOutcome = {
  success: boolean;
  checks: CompletionCheckOutcome[];
  scope_violation: boolean;
  validation_violations: string[];
  scope_audit: ScopeAudit;
};

export type SkillEvent = {
  skill: string;
  mode: string;
  activated_at_step: number;
};

export type PackageObservation = {
  ref: string;
  configured: boolean;
  loaded: boolean;
  read: boolean | null;
  activated: boolean | null;
  activation_source: string | null;
};

export type ExecutorRunResult = {
  trace: JsonRecord[];
  metrics: JsonRecord;
  finish_reason: string;
  final_message: string;
  validations_run: string[];
  changed_files_hint: string[];
  used_tools: string[];
  repeated_actions: number;
  skill_events: SkillEvent[];
  package_observations: PackageObservation[];
  system_prompt_snapshot: string;
  runtime_context_snapshot: JsonRecord;
};

export type DiagnosisOutcome = {
  failure_bucket: string[];
  suspected_gap: string[];
  suspected_root_cause: string[];
  diagnosis_reason: string[];
  recommended_action: string[];
};

export type DesignSnapshot = {
  mode: ExperimentMode;
  replica_count: number;
  baseline_variant_id: string;
  comparison_variant_ids: string[];
  changed_axes: Record<string, string>;
  cases: CatalogCaseSummary[];
  variants: CatalogVariantSummary[];
};

export type ExperimentCreateRequest = {
  name: string;
  mode?: ExperimentMode;
  replica_count?: number;
  case_ids: string[];
  baseline_variant_id: string;
  comparison_variant_ids: string[];
};

export type ExperimentListRead = {
  id: string;
  name: string;
  mode: ExperimentMode;
  status: string;
  case_count: number;
  variant_count: number;
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  overall_success_rate: number;
  created_at: string;
  updated_at: string;
};

export type RunRead = {
  id: string;
  experiment_id: string;
  case_id: string;
  variant_id: string;
  replica_index: number;
  status: string;
  metrics: JsonRecord;
  judge_payload: JsonRecord;
  failure_bucket: string[];
  suspected_gap: string[];
  suspected_root_cause: string[];
  strategy_snapshot: JsonRecord;
  artifact_paths: Record<string, string>;
  result_payload: JsonRecord;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type ExperimentRead = {
  id: string;
  name: string;
  mode: ExperimentMode;
  status: string;
  replica_count: number;
  case_ids: string[];
  baseline_variant_id: string;
  comparison_variant_ids: string[];
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  aggregate_payload: JsonRecord;
  report_paths: Record<string, string>;
  runs: RunRead[];
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type TraceEventRead = {
  index: number;
  kind: string;
  source: string;
  tool_name: string | null;
  summary: string;
  payload: JsonRecord;
  timestamp: string | null;
};

export type RunTraceRead = {
  run_id: string;
  events: TraceEventRead[];
  derived: {
    used_tools: string[];
    validations_run: string[];
    final_message: string;
    finish_reason: string;
    tool_call_count: number;
    parse_warnings: number;
  };
};
