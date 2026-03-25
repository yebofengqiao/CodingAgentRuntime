import type {
  CaseDefinition,
  ExecutorRunResult,
  PromptBundle,
  ResolvedStrategyBundle,
} from "../schemas";
import type { WorkspaceHandle } from "../services/workspace-manager";

export class RunCancelledError extends Error {}

export type EvaluationExecutor = (
  caseDefinition: CaseDefinition,
  strategy: ResolvedStrategyBundle,
  promptBundle: PromptBundle,
  workspace: WorkspaceHandle,
) => Promise<ExecutorRunResult>;
