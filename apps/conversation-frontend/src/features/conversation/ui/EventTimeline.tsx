import { useMemo, useState } from "react";
import { Button, Card, Collapse, Empty, Select, Space, Tag, Timeline, Typography } from "antd";

import { formatEventKindLabel, formatEventSourceLabel } from "@/shared/lib/status";

import type { ConversationEvent } from "../model/types";

type Props = {
  events: ConversationEvent[];
  onClose: () => void;
};

const KIND_OPTIONS = [
  "all",
  "message",
  "action",
  "observation",
  "condensation",
  "user_approve",
  "user_reject",
  "agent_error",
  "conversation_error",
  "system_prompt",
];

export function EventTimeline({ events, onClose }: Props) {
  const [kind, setKind] = useState("all");

  const filteredEvents = useMemo(() => {
    if (kind === "all") {
      return events;
    }
    return events.filter((event) => event.kind === kind);
  }, [events, kind]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          事件流
        </Typography.Title>
        <Space size={8} wrap>
          <Select
            value={kind}
            onChange={setKind}
            style={{ minWidth: 140 }}
            options={KIND_OPTIONS.map((option) => ({
              value: option,
              label: formatEventKindLabel(option),
            }))}
          />
          <Button autoInsertSpace={false} onClick={onClose}>
            关闭
          </Button>
        </Space>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", marginTop: 16 }}>
        {filteredEvents.length === 0 ? (
          <Empty description="当前筛选条件下没有事件" />
        ) : (
          <Timeline
            items={filteredEvents.map((event) => ({
              children: (
                <Card size="small">
                  <Space size={8} wrap>
                    <Typography.Text strong>#{event.seq}</Typography.Text>
                    <Tag>{formatEventKindLabel(event.kind)}</Tag>
                    <Tag>{formatEventSourceLabel(event.source)}</Tag>
                  </Space>
                  <Collapse
                    size="small"
                    ghost
                    style={{ marginTop: 8 }}
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
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        ),
                      },
                    ]}
                  />
                </Card>
              ),
            }))}
          />
        )}
      </div>
    </div>
  );
}
