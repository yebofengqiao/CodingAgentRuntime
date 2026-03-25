import type {
  CaseDefinition,
  ExecutorRunResult,
  JudgeOutcome,
  PromptBundle,
} from "../schemas";
import { diagnoseRun } from "./diagnosis-engine";

export function classifyFailure(
  caseDefinition: CaseDefinition,
  promptBundle: PromptBundle,
  executorResult: ExecutorRunResult,
  judgeResult: JudgeOutcome,
): { taxonomy: string[]; root_causes: string[] } {
  const diagnosis = diagnoseRun(caseDefinition, promptBundle, executorResult, judgeResult);
  return {
    taxonomy: diagnosis.failure_bucket,
    root_causes: diagnosis.diagnosis_reason,
  };
}
