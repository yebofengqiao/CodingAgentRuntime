import { get_message_text, get_system_prompt_text } from "@openhands-rl/runtime-core/runtime";

import type { TraceEventRead } from "../schemas";
import { getMongoDb } from "../../infrastructure/persistence/clients";
import type { EvaluationRunTraceDocument } from "../models";

export async function storeRunTrace(runId: string, trace: Record<string, unknown>[]): Promise<void> {
  const db = await getMongoDb();
  await db.collection("evaluation_run_traces").deleteMany({ runId });

  if (trace.length === 0) {
    return;
  }

  await db.collection("evaluation_run_traces").insertMany(
    trace.map((item, index) => {
      const payload = (item.payload ?? item.arguments ?? {}) as Record<string, unknown>;
      const toolName =
        typeof item.tool_name === "string"
          ? item.tool_name
          : typeof payload.tool_name === "string"
            ? String(payload.tool_name)
            : null;
      const summary =
        typeof item.summary === "string"
          ? item.summary
          : typeof item.text === "string"
            ? item.text
            : item.kind === "message"
              ? get_message_text(payload)
              : item.kind === "system_prompt"
                ? get_system_prompt_text(payload)
              : item.kind === "action"
                ? `action:${toolName ?? "unknown"}`
                : String(item.kind ?? "event");

      return {
        runId,
        index,
        kind: String(item.kind ?? "unknown"),
        source: String(item.source ?? "runtime"),
        toolName,
        summary,
        payload,
        timestamp:
          typeof item.timestamp === "string" && item.timestamp ? new Date(item.timestamp) : null,
      };
    }),
  );
}

export async function listRunTraceDocuments(runId: string): Promise<EvaluationRunTraceDocument[]> {
  const db = await getMongoDb();
  const docs = await db
    .collection<EvaluationRunTraceDocument>("evaluation_run_traces")
    .find({ runId })
    .sort({ index: 1 })
    .toArray();
  return docs.map((doc) => ({
    ...doc,
    timestamp: doc.timestamp instanceof Date ? doc.timestamp : null,
  }));
}
