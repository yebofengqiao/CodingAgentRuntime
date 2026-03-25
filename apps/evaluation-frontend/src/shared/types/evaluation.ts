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
  kind: "strategy" | "business_fine_tuning";
  description: string;
  changed_axis: string;
  prompt_version: string;
  model_profile: string;
  business_context_profile: string;
  session_context_policy: string;
  package_refs: string[];
  source_path: string;
};

export type ExperimentCreatePayload = {
  name: string;
  mode?: "strategy" | "business_fine_tuning";
  replica_count?: number;
  case_ids: string[];
  baseline_variant_id: string;
  comparison_variant_ids: string[];
};

export type ExperimentListItem = {
  id: string;
  name: string;
  mode: "strategy" | "business_fine_tuning";
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

export type ExperimentStartResponse = {
  id: string;
  status: string;
  started: boolean;
};

export type RunActionResponse = {
  id: string;
  status: string;
  started: boolean;
};

export type RunRead = {
  id: string;
  experiment_id: string;
  case_id: string;
  variant_id: string;
  replica_index: number;
  status: string;
  metrics: Record<string, unknown>;
  judge_payload: Record<string, unknown>;
  failure_bucket: string[];
  suspected_gap: string[];
  suspected_root_cause: string[];
  strategy_snapshot: Record<string, unknown>;
  artifact_paths: Record<string, string>;
  result_payload: Record<string, unknown>;
  error_message: string | null;
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
  payload: Record<string, unknown>;
  timestamp: string | null;
};

export type RunTraceDerivedRead = {
  used_tools: string[];
  validations_run: string[];
  final_message: string;
  finish_reason: string;
  tool_call_count: number;
  parse_warnings: number;
};

export type RunTraceRead = {
  run_id: string;
  events: TraceEventRead[];
  derived: RunTraceDerivedRead;
};

export type ExperimentRead = {
  id: string;
  name: string;
  mode: "strategy" | "business_fine_tuning";
  status: string;
  replica_count: number;
  case_ids: string[];
  baseline_variant_id: string;
  comparison_variant_ids: string[];
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  aggregate_payload: Record<string, unknown>;
  report_paths: Record<string, string>;
  runs: RunRead[];
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type VariantAggregateSummary = {
  variant_id: string;
  kind?: string;
  changed_axis: string;
  prompt_version: string;
  model_profile: string;
  business_context_profile: string;
  session_context_policy: string;
  package_refs?: string[];
  run_count: number;
  success_rate: number;
  avg_duration_seconds: number;
  avg_cost_usd: number;
  failure_bucket_counts: Record<string, number>;
  gap_bucket_counts: Record<string, number>;
};

export type DesignSnapshot = {
  baseline_variant_id: string;
  comparison_variant_ids: string[];
  changed_axes: Record<string, string>;
  cases: CatalogCaseSummary[];
  variants: CatalogVariantSummary[];
};
