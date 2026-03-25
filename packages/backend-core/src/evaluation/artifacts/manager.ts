import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { settings } from "../../config/settings";
import { getMongoDb } from "../../infrastructure/persistence/clients";
import { ensureDir } from "../../shared";

export type RunArtifactPaths = {
  result_file: string;
  trace_file: string;
  diff_file: string;
  system_prompt_file: string;
  runtime_context_file: string;
  judge_file: string;
  summary_file: string;
};

export function buildRunArtifactPaths(runId: string): RunArtifactPaths {
  const root = settings.artifactRoot;
  ensureDir(resolve(root, "runs"));
  ensureDir(resolve(root, "traces"));
  ensureDir(resolve(root, "diffs"));
  ensureDir(resolve(root, "system-prompts"));
  ensureDir(resolve(root, "runtime-contexts"));
  ensureDir(resolve(root, "judge"));
  const stem = String(runId);
  return {
    result_file: resolve(root, "runs", `${stem}.json`),
    trace_file: resolve(root, "traces", `${stem}.jsonl`),
    diff_file: resolve(root, "diffs", `${stem}.patch`),
    system_prompt_file: resolve(root, "system-prompts", `${stem}.system-prompt.md`),
    runtime_context_file: resolve(root, "runtime-contexts", `${stem}.runtime-context.json`),
    judge_file: resolve(root, "judge", `${stem}.json`),
    summary_file: resolve(root, "runs", `${stem}.summary.txt`),
  };
}

export function buildExperimentReportPaths(experimentId: string): Record<string, string> {
  const reportsDir = resolve(settings.artifactRoot, "reports");
  ensureDir(reportsDir);
  const stem = String(experimentId);
  return {
    aggregate_json: resolve(reportsDir, `${stem}.aggregate.json`),
    report_markdown: resolve(reportsDir, `${stem}.report.md`),
    report_csv: resolve(reportsDir, `${stem}.report.csv`),
  };
}

async function indexArtifact(scope: "run" | "experiment", scopeId: string, kind: string, path: string) {
  const db = await getMongoDb();
  await db.collection("artifact_index").updateOne(
    { scope, scopeId, kind },
    {
      $set: {
        scope,
        scopeId,
        kind,
        path,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function writeArtifactText(
  scope: "run" | "experiment",
  scopeId: string,
  kind: string,
  path: string,
  content: string,
): Promise<void> {
  ensureDir(resolve(path, ".."));
  writeFileSync(path, content, "utf-8");
  await indexArtifact(scope, scopeId, kind, path);
}

export async function writeArtifactJson(
  scope: "run" | "experiment",
  scopeId: string,
  kind: string,
  path: string,
  value: unknown,
): Promise<void> {
  await writeArtifactText(scope, scopeId, kind, path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeArtifactJsonl(
  scope: "run" | "experiment",
  scopeId: string,
  kind: string,
  path: string,
  items: unknown[],
): Promise<void> {
  const lines = items.map((item) => JSON.stringify(item)).join("\n");
  await writeArtifactText(scope, scopeId, kind, path, lines ? `${lines}\n` : "");
}
