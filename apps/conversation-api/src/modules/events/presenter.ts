type JsonRecord = Record<string, unknown>;
type TextContentBlock = {
  type: "text";
  text: string;
  cache_prompt?: boolean;
};
type LlmMessagePayload = {
  role: string;
  content: TextContentBlock[];
};

type ConversationEventLike = {
  seq: number;
  event_id: string;
  kind: string;
  source: string;
  payload: JsonRecord;
  timestamp: string;
};

type ConversationPacketLike =
  | { type: "event"; data: ConversationEventLike }
  | { type: string; data: unknown };

function createTextContentBlock(text: string): TextContentBlock {
  return {
    type: "text",
    text,
  };
}

function getTextContentBlocks(value: unknown): TextContentBlock[] {
  if (typeof value === "string") {
    return value.trim() ? [createTextContentBlock(value.trim())] : [];
  }

  if (
    value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "text" &&
    typeof (value as { text?: unknown }).text === "string"
  ) {
    const text = String((value as { text: string }).text).trim();
    if (!text) {
      return [];
    }
    return [
      {
        type: "text",
        text,
        ...(typeof (value as { cache_prompt?: unknown }).cache_prompt === "boolean"
          ? { cache_prompt: Boolean((value as { cache_prompt?: unknown }).cache_prompt) }
          : {}),
      },
    ];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim() ? createTextContentBlock(item.trim()) : null;
      }
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string"
      ) {
        const text = String((item as { text: string }).text).trim();
        return text
          ? {
              type: "text" as const,
              text,
              ...(typeof (item as { cache_prompt?: unknown }).cache_prompt === "boolean"
                ? { cache_prompt: Boolean((item as { cache_prompt?: unknown }).cache_prompt) }
                : {}),
            }
          : null;
      }
      return null;
    })
    .filter((item): item is TextContentBlock => Boolean(item));
}

function getSystemPromptContentBlocks(payload: JsonRecord): TextContentBlock[] {
  const systemPrompt = getTextContentBlocks(payload.system_prompt);
  const dynamicContext = getTextContentBlocks(payload.dynamic_context);
  if (systemPrompt.length > 0 || dynamicContext.length > 0) {
    return [...systemPrompt, ...dynamicContext];
  }

  const legacyContentBlocks = getTextContentBlocks(payload.content_blocks);
  if (legacyContentBlocks.length > 0) {
    return legacyContentBlocks;
  }

  const legacyBaseText =
    typeof payload.base_text === "string" && payload.base_text.trim()
      ? payload.base_text.trim()
      : "";
  if (legacyBaseText) {
    return [createTextContentBlock(legacyBaseText)];
  }

  const legacyText =
    typeof payload.text === "string" && payload.text.trim() ? payload.text.trim() : "";
  return legacyText ? [createTextContentBlock(legacyText)] : [];
}

function getMessageRole(payload: JsonRecord): string | null {
  if (payload.llm_message && typeof payload.llm_message === "object") {
    const role = (payload.llm_message as { role?: unknown }).role;
    if (typeof role === "string" && role.trim()) {
      return role.trim();
    }
  }
  return typeof payload.role === "string" && payload.role.trim() ? payload.role.trim() : null;
}

function getMessageContentBlocks(payload: JsonRecord): TextContentBlock[] {
  if (payload.llm_message && typeof payload.llm_message === "object") {
    const blocks = getTextContentBlocks((payload.llm_message as { content?: unknown }).content);
    if (blocks.length > 0) {
      return blocks;
    }
  }

  const rawText =
    typeof payload.raw_text === "string" && payload.raw_text.trim() ? payload.raw_text.trim() : "";
  if (rawText) {
    return [createTextContentBlock(rawText)];
  }

  const legacyText =
    typeof payload.text === "string" && payload.text.trim() ? payload.text.trim() : "";
  return legacyText ? [createTextContentBlock(legacyText)] : [];
}

function getMessageExtendedContent(payload: JsonRecord): TextContentBlock[] {
  return getTextContentBlocks(payload.extended_content);
}

function compact_system_prompt_payload(payload: JsonRecord): JsonRecord {
  const content = getSystemPromptContentBlocks(payload);
  const system_prompt = content[0] ?? createTextContentBlock("");
  const dynamic_context = content[1] ?? null;

  return {
    system_prompt,
    ...(dynamic_context ? { dynamic_context } : {}),
    tools: Array.isArray(payload.tools) ? payload.tools : [],
    ...(typeof payload.context_root === "string" ? { context_root: payload.context_root } : {}),
    ...(typeof payload.platform_context_root === "string" || payload.platform_context_root === null
      ? {
          platform_context_root:
            (payload.platform_context_root as string | null | undefined) ?? null,
        }
      : {}),
    ...(typeof payload.workspace_context_root === "string"
      ? { workspace_context_root: payload.workspace_context_root }
      : {}),
    ...(typeof payload.working_dir === "string" ? { working_dir: payload.working_dir } : {}),
  };
}

function compact_message_payload(event: ConversationEventLike): JsonRecord {
  const payload = event.payload;
  const content = getMessageContentBlocks(payload);
  const role = getMessageRole(payload) ?? event.source;
  const llm_message: LlmMessagePayload = {
    role,
    content,
  };

  return {
    llm_message,
    activated_skills: Array.isArray(payload.activated_skills) ? payload.activated_skills : [],
    extended_content: getMessageExtendedContent(payload),
    ...(typeof payload.llm_response_id === "string" || payload.llm_response_id === null
      ? { llm_response_id: (payload.llm_response_id as string | null | undefined) ?? null }
      : {}),
    ...(typeof payload.sender === "string" || payload.sender === null
      ? { sender: (payload.sender as string | null | undefined) ?? null }
      : {}),
  };
}

function compact_event_payload(event: ConversationEventLike): JsonRecord {
  if (event.kind === "system_prompt") {
    return compact_system_prompt_payload(event.payload);
  }
  if (event.kind === "message") {
    return compact_message_payload(event);
  }
  return event.payload;
}

export function presentConversationEvent<T extends ConversationEventLike>(event: T): T {
  return {
    ...event,
    payload: compact_event_payload(event),
  };
}

export function presentConversationEvents<T>(payload: T): T {
  if (!Array.isArray(payload)) {
    return payload;
  }
  return payload.map((event) => presentConversationEvent(event as ConversationEventLike)) as T;
}

export function presentConversationPacket<T extends ConversationPacketLike>(packet: T): T {
  if (packet.type !== "event") {
    return packet;
  }
  return {
    ...packet,
    data: presentConversationEvent(packet.data as ConversationEventLike),
  } as T;
}
