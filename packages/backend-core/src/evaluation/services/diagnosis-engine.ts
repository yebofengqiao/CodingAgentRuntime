import type {
  CaseDefinition,
  DiagnosisOutcome,
  ExecutorRunResult,
  JudgeOutcome,
  PromptBundle,
} from "../schemas";

export function diagnoseRun(
  caseDefinition: CaseDefinition,
  promptBundle: PromptBundle,
  executorResult: ExecutorRunResult,
  judgeResult: JudgeOutcome,
): DiagnosisOutcome {
  const failureBucket: string[] = [];
  const suspectedGap: string[] = [];
  const suspectedRootCause: string[] = [];
  const diagnosisReason: string[] = [];
  const recommendedAction: string[] = [];
  const traceText = executorResult.trace
    .map((event) => JSON.stringify(event))
    .join("\n")
    .toLowerCase();

  if (
    traceText.includes("does not exist or you do not have access") ||
    traceText.includes("model or endpoint")
  ) {
    failureBucket.push("environment_error");
    suspectedGap.push("environment_gap");
    diagnosisReason.push("Configured runtime model endpoint is unavailable or inaccessible in the current environment.");
    recommendedAction.push("Align model_profile runtime model name with the active LLM_MODEL environment or provision access to the configured endpoint.");
  }

  if (judgeResult.scope_violation) {
    failureBucket.push("scope_violation");
    suspectedGap.push("workspace_gap");
    diagnosisReason.push("Run changed protected or non-editable files relative to case scope.");
    recommendedAction.push("Tighten scope handling and verify editable/protected paths before finishing.");
  }

  if (judgeResult.validation_violations.length > 0) {
    failureBucket.push("finish_without_validation");
    diagnosisReason.push("Run finished without executing all configured validation commands.");
    recommendedAction.push("Strengthen finish checklist handling and require validation before final response.");
  }

  if (
    judgeResult.checks.some(
      (check) => !check.passed && (check.details.includes("build") || check.details.includes("test")),
    )
  ) {
    failureBucket.push("build_or_test_regression");
    diagnosisReason.push("Build or test style completion checks failed.");
  }

  if (["max_steps", "timeout", "waiting_for_confirmation", "error"].includes(executorResult.finish_reason)) {
    failureBucket.push("execution_loop_failure");
    diagnosisReason.push(`Executor ended with finish_reason=${executorResult.finish_reason}.`);
  }

  if (executorResult.repeated_actions > 1) {
    failureBucket.push("execution_loop_failure");
    diagnosisReason.push("Executor repeated the same action beyond the acceptable threshold.");
  }

  if (caseDefinition.tuning_axis === "skills" && promptBundle.loaded_skills.length === 0) {
    failureBucket.push("skill_missing_or_not_triggered");
    suspectedGap.push("skills_gap");
    diagnosisReason.push("Skill-focused case ran without loaded skill notes.");
    recommendedAction.push("Expand enabled_skills or narrow case_bindings.skill_subset for this variant.");
  }

  if (judgeResult.scope_audit.changed_files.length === 0 && !judgeResult.success) {
    failureBucket.push("repo_navigation_failure");
    diagnosisReason.push("Run did not change any file in the prepared workspace.");
    if (!suspectedGap.includes("context_gap")) {
      suspectedGap.push("context_gap");
    }
    recommendedAction.push("Improve repo map and business context coverage for the target module area.");
  }

  if (
    (caseDefinition.context_mode.includes("session") || caseDefinition.id.includes("LONG")) &&
    !judgeResult.success
  ) {
    failureBucket.push("long_context_forgetting");
    if (!suspectedGap.includes("context_gap")) {
      suspectedGap.push("context_gap");
    }
    diagnosisReason.push("Session-focused case failed after multi-step execution.");
    recommendedAction.push("Tighten session_context_policy compaction and long-run state retention.");
  }

  if (promptBundle.resolved_strategy.kind === "business_fine_tuning" && !judgeResult.success) {
    const configuredRefs = new Set(promptBundle.configured_packages);
    const loadedRefs = new Set(promptBundle.loaded_packages);
    if (configuredRefs.size > 0 && loadedRefs.size === 0) {
      suspectedRootCause.push("package_not_loaded");
      diagnosisReason.push("Business fine-tuning variant configured packages but none were loaded into prompt assembly.");
      recommendedAction.push("Verify context_packages resolution and package_subset filtering for this variant.");
    }

    const observedLoaded = executorResult.package_observations.filter((item) => item.loaded);
    const anyActivated = executorResult.package_observations.some((item) => item.activated === true);
    if (observedLoaded.length > 0 && !anyActivated) {
      suspectedRootCause.push("package_not_activated");
      diagnosisReason.push("Configured packages were available to the run, but no package reached the activated state.");
      recommendedAction.push("Adjust the skill/package instructions so the model explicitly opens the package entry or its supporting resources during execution.");
    }

    if (anyActivated && judgeResult.scope_audit.changed_files.length > 0 && !judgeResult.success) {
      suspectedRootCause.push("package_activated_but_instruction_weak");
      diagnosisReason.push("The run activated the package and produced code changes, but the changes still failed completion checks.");
      recommendedAction.push("Tighten the activated skill/package content with exact examples, counterexamples, and validation steps for this case.");
    }

    if (executorResult.validations_run.length === 0 && judgeResult.validation_violations.length > 0) {
      suspectedRootCause.push("validation_gap");
    }

    if (caseDefinition.expected_skills.length > 0 && anyActivated) {
      suspectedRootCause.push("skill_content_gap");
    }
  }

  if (suspectedGap.length === 0) {
    if (caseDefinition.tuning_axis === "context") {
      suspectedGap.push("context_gap");
      recommendedAction.push("Tune business_context_profile or session_context_policy for this case family.");
    } else if (caseDefinition.tuning_axis === "session_context") {
      suspectedGap.push("context_gap");
      recommendedAction.push("Tune session_context_policy compaction and recall settings for long-running cases.");
    } else if (caseDefinition.tuning_axis === "skills") {
      suspectedGap.push("skills_gap");
      recommendedAction.push("Tune enabled_skills coverage and task-specific skill selection.");
    } else if (caseDefinition.tuning_axis === "prompt") {
      suspectedGap.push("prompt_gap");
      recommendedAction.push("Tune prompt_version task card and finish checklist structure.");
    } else if (caseDefinition.tuning_axis === "model") {
      suspectedGap.push("model_gap");
      recommendedAction.push("Compare with a stronger model_profile for the same case bundle.");
    } else {
      suspectedGap.push("context_gap");
    }
  }

  if (failureBucket.length === 0 && !judgeResult.success) {
    failureBucket.push("task_misunderstanding");
    diagnosisReason.push("Run failed completion checks without a more specific rule match.");
  }

  return {
    failure_bucket: Array.from(new Set(failureBucket)),
    suspected_gap: Array.from(new Set(suspectedGap)),
    suspected_root_cause: Array.from(new Set(suspectedRootCause)),
    diagnosis_reason: Array.from(new Set(diagnosisReason)),
    recommended_action: Array.from(new Set(recommendedAction)),
  };
}
