import { getArtifactUrl } from "@/shared/api/evaluation-client";
import { getTerm } from "@/shared/lib/terms";
import type { RunRead } from "@/shared/types/evaluation";

export type ArtifactLinkItem = {
  key: string;
  label: string;
  description?: string | null;
  href: string;
};

type ArtifactDefinition = {
  key: string;
  pathKey: keyof RunRead["artifact_paths"];
  termKey: string;
  kind: "result" | "system_prompt" | "runtime_context" | "trace" | "diff" | "judge";
};

const RUN_ARTIFACT_DEFINITIONS: ArtifactDefinition[] = [
  { key: "result", pathKey: "result_file", termKey: "artifact.result", kind: "result" },
  { key: "prompt", pathKey: "system_prompt_file", termKey: "artifact.system_prompt", kind: "system_prompt" },
  { key: "context", pathKey: "runtime_context_file", termKey: "artifact.runtime_context", kind: "runtime_context" },
  { key: "trace", pathKey: "trace_file", termKey: "artifact.trace", kind: "trace" },
  { key: "diff", pathKey: "diff_file", termKey: "artifact.diff", kind: "diff" },
  { key: "judge", pathKey: "judge_file", termKey: "artifact.judge", kind: "judge" },
];

export function getRunArtifactLinks(run: Pick<RunRead, "id" | "artifact_paths">): ArtifactLinkItem[] {
  return RUN_ARTIFACT_DEFINITIONS.flatMap((definition) => {
    if (!run.artifact_paths[definition.pathKey]) {
      return [];
    }

    const term = getTerm(definition.termKey);
    return [
      {
        key: definition.key,
        label: term.label,
        description: term.description,
        href: getArtifactUrl(run.id, definition.kind),
      },
    ];
  });
}

export function formatArtifactEmptyText(status: string) {
  return ["completed", "failed", "cancelled"].includes(status) ? "暂无" : "生成中";
}
