import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Bubble } from "@chatui/core";
import { Alert, Button, Card, Collapse, Empty, Input, Space, Tag, Typography } from "antd";

import { formatEventKindLabel, formatEventSourceLabel, formatStatusColor, formatStatusLabel } from "@/shared/lib/status";

import { MarkdownMessage } from "./MarkdownMessage";
import type { ConversationEvent, ConversationRun } from "../model/types";

type EventCardContent = {
  kind: string;
  source: string;
  summary: string;
  payload: Record<string, unknown>;
};

type BaseChatMessage = {
  id: string;
  position: "left" | "right";
  createdAt?: number;
};

type TextChatMessage = BaseChatMessage & {
  type: "text";
  content: {
    text: string;
  };
};

type EventChatMessage = BaseChatMessage & {
  type: "event";
  content: EventCardContent;
};

type ChatMessage = TextChatMessage | EventChatMessage;

type Props = {
  status: string;
  events: ConversationEvent[];
  activeConversationId: string | null;
  onSend: (text: string) => Promise<void>;
  latestRun: ConversationRun | null;
  pendingActionId: string | null;
  onApproveAction: () => Promise<void>;
  onRejectAction: () => Promise<void>;
  onOpenEventsDrawer: () => void;
  busy: boolean;
  isSending: boolean;
  isDeciding: boolean;
  lastError: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getRole(payload: Record<string, unknown>): string | null {
  if (payload.llm_message && typeof payload.llm_message === "object") {
    const role = asString((payload.llm_message as { role?: unknown }).role);
    if (role) {
      return role;
    }
  }
  return asString(payload.role);
}

function getTextBlocks(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string"
          ? String((item as { text: string }).text)
          : "",
    )
    .map((text) => text.trim())
    .filter(Boolean);
}

function getMessageText(
  payload: Record<string, unknown>,
  options?: { includeExtendedContent?: boolean },
): string | null {
  const includeExtendedContent = options?.includeExtendedContent ?? true;
  const llmMessageBlocks =
    payload.llm_message && typeof payload.llm_message === "object"
      ? getTextBlocks((payload.llm_message as { content?: unknown }).content)
      : [];
  const extendedBlocks = includeExtendedContent ? getTextBlocks(payload.extended_content) : [];
  const combined = [...llmMessageBlocks, ...extendedBlocks].join("\n\n").trim();
  if (combined) {
    return combined;
  }

  if (typeof payload.raw_text === "string" && payload.raw_text.trim()) {
    return payload.raw_text.trim();
  }

  const legacy = asString(payload.text);
  return legacy?.trim() || null;
}

function getSystemPromptText(payload: Record<string, unknown>): string | null {
  const systemPrompt =
    payload.system_prompt && typeof payload.system_prompt === "object"
      ? asString((payload.system_prompt as { text?: unknown }).text)
      : null;
  const dynamicContext =
    payload.dynamic_context && typeof payload.dynamic_context === "object"
      ? asString((payload.dynamic_context as { text?: unknown }).text)
      : null;
  const combined = [systemPrompt, dynamicContext].filter(Boolean).join("\n\n").trim();
  if (combined) {
    return combined;
  }
  return asString(payload.text);
}

function truncate(text: string, limit = 160): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 3)}...`;
}

function parseTimestamp(timestamp: string): number | undefined {
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? undefined : value;
}

function summarizeEvent(event: ConversationEvent): string {
  const payload = event.payload;
  const toolName = asString(payload.tool_name);

  if (event.kind === "action") {
    const summary = asString(payload.summary);
    const risk = asString(payload.security_risk);
    const parts = [
      toolName ? `工具=${toolName}` : null,
      summary ?? null,
      risk ? `风险=${risk}` : null,
    ].filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(" | ") : "动作事件";
  }

  if (event.kind === "observation") {
    const result = asString(payload.result);
    const parts = [toolName ? `工具=${toolName}` : null, result ? truncate(result) : null]
      .filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(" | ") : "观察事件";
  }

  if (event.kind === "condensation") {
    const reason = asString(payload.reason);
    const summary = asString(payload.summary);
    const parts = [
      reason ? `原因=${reason}` : null,
      summary ? truncate(summary) : null,
    ].filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(" | ") : "上下文压缩";
  }

  if (event.kind === "agent_error") {
    const error = asString(payload.error);
    const parts = [toolName ? `工具=${toolName}` : null, error ? truncate(error) : null]
      .filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(" | ") : "智能体异常";
  }

  if (event.kind === "conversation_error") {
    const code = asString(payload.code);
    const detail = asString(payload.detail);
    const parts = [code ? `代码=${code}` : null, detail ? truncate(detail) : null]
      .filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(" | ") : "会话异常";
  }

  if (event.kind === "user_approve" || event.kind === "user_reject") {
    const actionId = asString(payload.action_id);
    const reason = asString(payload.reason);
    const parts = [
      actionId ? `动作=${actionId.slice(0, 8)}` : null,
      reason ? `原因=${truncate(reason)}` : null,
    ].filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(" | ") : formatEventKindLabel(event.kind);
  }

  if (event.kind === "system_prompt") {
    const text = getSystemPromptText(payload);
    return text ? truncate(text) : "系统提示词";
  }

  if (event.kind === "message") {
    const role = getRole(payload);
    const text = getMessageText(payload, {
      includeExtendedContent: role !== "user",
    });
    if (text) {
      return role ? `${formatEventSourceLabel(role)}：${truncate(text)}` : truncate(text);
    }
    return role ? `消息角色=${formatEventSourceLabel(role)}` : "消息事件";
  }

  return `${formatEventKindLabel(event.kind)} | 来源=${formatEventSourceLabel(event.source)}`;
}

function toChatMessage(event: ConversationEvent): ChatMessage {
  const payload = event.payload;
  const role = getRole(payload);
  const text = getMessageText(payload, {
    includeExtendedContent: role !== "user",
  });

  if (event.kind === "message" && text && (role === "user" || role === "assistant")) {
    return {
      id: `${event.seq}-${event.event_id}`,
      type: "text",
      content: { text },
      position: role === "user" ? "right" : "left",
      createdAt: parseTimestamp(event.timestamp),
    };
  }

  return {
    id: `${event.seq}-${event.event_id}`,
    type: "event",
    content: {
      kind: event.kind,
      source: event.source,
      summary: summarizeEvent(event),
      payload: event.payload,
    },
    position: event.source === "user" ? "right" : "left",
    createdAt: parseTimestamp(event.timestamp),
  };
}

export function ChatPanel({
  status,
  events,
  activeConversationId,
  onSend,
  latestRun,
  pendingActionId,
  onApproveAction,
  onRejectAction,
  onOpenEventsDrawer,
  busy,
  isSending,
  isDeciding,
  lastError,
}: Props) {
  const messages = useMemo(() => events.map(toChatMessage), [events]);
  const [draft, setDraft] = useState("");
  const streamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = streamRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [messages.length, pendingActionId]);

  const submitDraft = useCallback(async () => {
    const text = draft.trim();
    if (!text || !activeConversationId || busy || isSending) {
      return;
    }
    await onSend(text);
    setDraft("");
  }, [activeConversationId, busy, draft, isSending, onSend]);

  const handleComposerKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }
      event.preventDefault();
      await submitDraft();
    },
    [submitDraft],
  );

  const conversationDesc = activeConversationId
    ? `会话 ${activeConversationId.slice(0, 8)}`
    : "当前没有激活会话";
  const composerPlaceholder = activeConversationId ? "输入消息" : "当前没有可用会话";

  return (
    <Card
      style={{ height: "100%" }}
      styles={{
        body: {
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          padding: 0,
          overflow: "hidden",
        },
      }}
    >
      {lastError ? <Alert type="error" showIcon message={lastError} banner /> : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          padding: "20px 20px 16px",
          borderBottom: "1px solid rgba(5, 5, 5, 0.06)",
        }}
      >
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            对话控制台
          </Typography.Title>
          <Typography.Text type="secondary">{conversationDesc}</Typography.Text>
        </div>
        <Space size={8} wrap>
          <Button size="small" autoInsertSpace={false} onClick={onOpenEventsDrawer}>
            事件流
          </Button>
          <Tag color={formatStatusColor(status)}>{formatStatusLabel(status)}</Tag>
          {latestRun ? (
            <Tag color={formatStatusColor(latestRun.status)}>
              运行 {latestRun.run_id.slice(0, 8)} · {formatStatusLabel(latestRun.status)}
            </Tag>
          ) : null}
          {isSending ? <Typography.Text type="secondary">发送中...</Typography.Text> : null}
        </Space>
      </div>

      <div
        ref={streamRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {messages.length === 0 ? (
          <Empty
            description={
              <Space direction="vertical" size={4}>
                <Typography.Text strong>开始新的编码回合</Typography.Text>
                <Typography.Text type="secondary">
                  发送需求、Bug 描述或实现任务。这里会持续展示消息、动作、观察结果和审批节点。
                </Typography.Text>
              </Space>
            }
            style={{ margin: "auto" }}
          />
        ) : (
          messages.map((message) => {
            const messageTime =
              typeof message.createdAt === "number"
                ? new Date(message.createdAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : undefined;

            const bubbleBody =
              message.type === "text" ? (
                <MarkdownMessage content={message.content.text} />
              ) : (
                <Card size="small" styles={{ body: { padding: 12 } }}>
                  <Space size={6} wrap>
                    <Tag>{formatEventKindLabel(message.content.kind)}</Tag>
                    <Tag>{formatEventSourceLabel(message.content.source)}</Tag>
                  </Space>
                  <Typography.Paragraph style={{ margin: "8px 0 0" }}>
                    {message.content.summary}
                  </Typography.Paragraph>
                  {Object.keys(message.content.payload).length > 0 ? (
                    <Collapse
                      size="small"
                      ghost
                      items={[
                        {
                          key: "payload",
                          label: "查看 payload",
                          children: (
                            <pre
                              style={{
                                margin: 0,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                fontSize: 12,
                                lineHeight: 1.5,
                              }}
                            >
                              {JSON.stringify(message.content.payload, null, 2)}
                            </pre>
                          ),
                        },
                      ]}
                    />
                  ) : null}
                </Card>
              );

            return (
              <div
                key={message.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: message.position === "right" ? "flex-end" : "flex-start",
                  gap: 6,
                }}
              >
                <div style={{ maxWidth: "min(72%, 760px)" }}>
                  <Bubble type={message.position === "right" ? "text" : "default"}>{bubbleBody}</Bubble>
                </div>
                {messageTime ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {messageTime}
                  </Typography.Text>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {pendingActionId ? (
        <div style={{ padding: "0 20px 16px" }}>
          <Alert
            type="warning"
            showIcon
            message="存在待审批动作"
            description={`动作 ${pendingActionId.slice(0, 8)}`}
            action={
              <Space>
                <Button onClick={() => void onRejectAction()} disabled={isDeciding}>
                  拒绝
                </Button>
                <Button type="primary" onClick={() => void onApproveAction()} loading={isDeciding}>
                  批准
                </Button>
              </Space>
            }
          />
        </div>
      ) : null}

      <div
        style={{
          padding: 16,
          borderTop: "1px solid rgba(5, 5, 5, 0.06)",
        }}
      >
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 6 }}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => void handleComposerKeyDown(event)}
          placeholder={composerPlaceholder}
          disabled={!activeConversationId || busy}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          <Typography.Text type="secondary">Enter 发送，Shift+Enter 换行</Typography.Text>
          <Button
            type="primary"
            autoInsertSpace={false}
            onClick={() => void submitDraft()}
            loading={isSending}
            disabled={!activeConversationId || busy || !draft.trim()}
          >
            发送
          </Button>
        </div>
      </div>
    </Card>
  );
}
