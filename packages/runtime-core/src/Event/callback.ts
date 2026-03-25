import { get_message_role, get_message_text, type Event } from "./event";

export type ConversationCallbackType = (event: Event) => Promise<void> | void;

function truncate(text: string, limit = 180): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(limit - 3, 0))}...`;
}

export function build_event_callback(): ConversationCallbackType {
  return (event) => {
    const payload = event.payload;

    if (event.kind === "action") {
      console.log(
        "[action]",
        `tool=${String(payload.tool_name ?? "")}`,
        `risk=${String(payload.security_risk ?? "unknown")}`,
        `summary=${truncate(String(payload.summary ?? ""))}`,
      );
      return;
    }

    if (event.kind === "observation") {
      console.log(
        "[observation]",
        `tool=${String(payload.tool_name ?? "")}`,
        `result=${truncate(String(payload.result ?? ""))}`,
      );
      return;
    }

    if (event.kind === "agent_error") {
      console.log(
        "[agent_error]",
        `tool=${String(payload.tool_name ?? "")}`,
        `error=${truncate(String(payload.error ?? ""))}`,
      );
      return;
    }

    if (event.kind === "conversation_error") {
      console.log(
        "[conversation_error]",
        `code=${String(payload.code ?? "")}`,
        `detail=${truncate(String(payload.detail ?? ""))}`,
      );
      return;
    }

    if (event.kind === "condensation") {
      console.log(
        "[condensation]",
        `reason=${String(payload.reason ?? "")}`,
        `summary=${truncate(String(payload.summary ?? ""))}`,
      );
      return;
    }

    if (event.kind === "message") {
      console.log(
        "[message]",
        `source=${event.source}`,
        `role=${String(get_message_role(payload) ?? "")}`,
        `text=${truncate(
          get_message_text(payload, {
            include_extended_content: event.source !== "user",
          }),
        )}`,
      );
      return;
    }

    console.log("[event]", `kind=${event.kind}`, `source=${event.source}`);
  };
}

export type ConversationCallback = ConversationCallbackType;
export const buildEventCallback = build_event_callback;
