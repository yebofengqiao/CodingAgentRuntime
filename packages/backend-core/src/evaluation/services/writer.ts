import {
  buildRunArtifactPaths,
  writeArtifactJson,
  writeArtifactJsonl,
  writeArtifactText,
} from "../artifacts/manager";
import type { JudgeOutcome } from "../schemas";

export async function writeRunArtifacts(
  runId: string,
  input: {
    systemPromptSnapshot: string;
    runtimeContextSnapshot: Record<string, unknown>;
    trace: Record<string, unknown>[];
    judgeResult: JudgeOutcome;
    resultRecord: Record<string, unknown>;
    summaryText: string;
    diffWriter: () => void;
  },
): Promise<Record<string, string>> {
  const paths = buildRunArtifactPaths(runId);
  await writeArtifactText("run", runId, "system_prompt_file", paths.system_prompt_file, input.systemPromptSnapshot);
  await writeArtifactJson(
    "run",
    runId,
    "runtime_context_file",
    paths.runtime_context_file,
    input.runtimeContextSnapshot,
  );
  await writeArtifactJsonl("run", runId, "trace_file", paths.trace_file, input.trace);
  input.diffWriter();
  await writeArtifactJson("run", runId, "judge_file", paths.judge_file, input.judgeResult);
  await writeArtifactJson("run", runId, "result_file", paths.result_file, input.resultRecord);
  await writeArtifactText("run", runId, "summary_file", paths.summary_file, input.summaryText);
  return paths;
}
