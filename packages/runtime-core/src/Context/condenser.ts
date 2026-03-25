import type { Event } from "../Event/event";
import { create_event, get_message_role, get_message_text } from "../Event/event";
import type { CondenserConfig } from "./context";

export type LlmViewEntry =
  | {
      id: string;
      type: "summary";
      text: string;
    }
  | {
      id: string;
      type: "event";
      event: Event;
    };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function truncate(text: string, limit = 180): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(limit - 3, 0))}...`;
}

function isRelevantEvent(event: Event): boolean {
  if (event.kind === "system_prompt") {
    return true;
  }
  if (event.kind === "message") {
    const role = get_message_role(event.payload);
    return role === "user" || role === "assistant";
  }
  return (
    event.kind === "action" ||
    event.kind === "observation" ||
    event.kind === "agent_error"
  );
}

function describeEvent(entry: LlmViewEntry): string {
  if (entry.type === "summary") {
    return `Summary: ${truncate(entry.text)}`;
  }

  const event = entry.event;
  if (event.kind === "system_prompt") {
    return "System prompt initialized";
  }
  if (event.kind === "message") {
    const role = get_message_role(event.payload) ?? "message";
    const text = get_message_text(event.payload, {
      include_extended_content: role !== "user",
    });
    return `${role}: ${truncate(text)}`;
  }
  if (event.kind === "action") {
    const tool = typeof event.payload.tool_name === "string" ? event.payload.tool_name : "tool";
    const summary =
      typeof event.payload.summary === "string"
        ? event.payload.summary
        : JSON.stringify(event.payload.arguments ?? {});
    return `Action ${tool}: ${truncate(summary)}`;
  }
  if (event.kind === "observation") {
    const tool = typeof event.payload.tool_name === "string" ? event.payload.tool_name : "tool";
    const result = typeof event.payload.result === "string" ? event.payload.result : "";
    return `Observation ${tool}: ${truncate(result)}`;
  }
  if (event.kind === "agent_error") {
    const tool = typeof event.payload.tool_name === "string" ? event.payload.tool_name : "tool";
    const error = typeof event.payload.error === "string" ? event.payload.error : "";
    return `Error ${tool}: ${truncate(error)}`;
  }
  return `${event.kind}`;
}

export function build_llm_view(events: Event[]): LlmViewEntry[] {
  let visible: LlmViewEntry[] = [];

  for (const event of events) {
    if (event.kind === "condensation") {
      const forgottenIds = new Set(
        Array.isArray(event.payload.forgotten_event_ids)
          ? event.payload.forgotten_event_ids.filter(
              (item): item is string => typeof item === "string" && item.trim().length > 0,
            )
          : [],
      );
      visible = visible.filter((entry) => !forgottenIds.has(entry.id));
      const summary = typeof event.payload.summary === "string" ? event.payload.summary : "";
      const rawOffset =
        typeof event.payload.summary_offset === "number" ? event.payload.summary_offset : visible.length;
      const offset = clamp(rawOffset, 0, visible.length);
      visible.splice(offset, 0, {
        id: event.id,
        type: "summary",
        text: summary,
      });
      continue;
    }

    if (!isRelevantEvent(event)) {
      continue;
    }

    visible.push({
      id: event.id,
      type: "event",
      event,
    });
  }

  return visible;
}

function renderSummary(entries: LlmViewEntry[]): string {
  const lines = ["Earlier conversation summary:"];
  for (const entry of entries) {
    lines.push(`- ${describeEvent(entry)}`);
  }
  return lines.join("\n");
}

export function maybe_build_condensation_event(
  events: Event[],
  config: CondenserConfig,
): Event | null {
  if (config.type !== "event_summary_v1") {
    return null;
  }

  const view = build_llm_view(events);
  if (view.length <= config.max_events) {
    return null;
  }

  const keep_first = clamp(config.keep_first, 0, Math.max(view.length - 1, 0));
  const keep_recent = clamp(config.keep_recent, 0, Math.max(view.length - keep_first, 0));
  const tail_start = Math.max(view.length - keep_recent, keep_first);
  const forgotten = view.slice(keep_first, tail_start);

  if (forgotten.length < 2) {
    return null;
  }

  return create_event("condensation", "agent", {
    reason: "event_count",
    forgotten_event_ids: forgotten.map((entry) => entry.id),
    summary: renderSummary(forgotten),
    summary_offset: keep_first,
  });
}
