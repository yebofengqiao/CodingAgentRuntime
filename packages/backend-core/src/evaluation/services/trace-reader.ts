import { get_message_text } from "@openhands-rl/runtime-core/runtime";

import { listRunTraceDocuments } from "../repositories/trace-repository";
import type { RunTraceRead, TraceEventRead } from "../schemas";

export async function readRunTrace(runId: string): Promise<RunTraceRead> {
  const docs = await listRunTraceDocuments(runId);
  const events: TraceEventRead[] = docs.map((doc) => ({
    index: Number(doc.index ?? 0),
    kind: String(doc.kind ?? "unknown"),
    source: String(doc.source ?? "runtime"),
    tool_name: typeof doc.toolName === "string" ? doc.toolName : null,
    summary: String(doc.summary ?? ""),
    payload: (doc.payload ?? {}) as Record<string, unknown>,
    timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : null,
  }));
  const usedTools = Array.from(new Set(events.map((item) => item.tool_name).filter(Boolean))) as string[];
  const validationsRun = events
    .filter((item) => item.tool_name === "terminal")
    .map((item) => {
      const command = item.payload.command;
      return typeof command === "string" ? command : item.summary;
    });
  const finalMessage =
    [...events]
      .reverse()
      .find((item) => item.kind === "message" && get_message_text(item.payload))
      ?.payload ?? {};

  return {
    run_id: runId,
    events,
    derived: {
      used_tools: usedTools,
      validations_run: validationsRun,
      final_message: get_message_text(finalMessage),
      finish_reason: String(
        [...events].reverse().find((item) => item.kind === "message") ? "completed" : "unknown",
      ),
      tool_call_count: events.filter((item) => item.kind === "action").length,
      parse_warnings: 0,
    },
  };
}
