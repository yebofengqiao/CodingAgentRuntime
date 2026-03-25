import { Button, Card, Empty, List, Space, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";

import { formatStatusColor, formatStatusLabel } from "@/shared/lib/status";
import { formatRelativeConversationTime } from "@/shared/lib/time";

import type { ConversationItem } from "../model/types";

type Props = {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onCreate: () => void;
  onDelete: (conversationId: string) => void;
  busy: boolean;
  compact?: boolean;
};

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
  busy,
  compact = false,
}: Props) {
  const navigate = useNavigate();
  const activeConversation = conversations.find(
    (conversation) => conversation.conversation_id === activeConversationId,
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: "100%",
        minHeight: 0,
        padding: compact ? "12px 12px 10px" : "20px 16px 16px",
        borderRight: compact ? "none" : "1px solid rgba(5, 5, 5, 0.06)",
        borderBottom: compact ? "1px solid rgba(5, 5, 5, 0.06)" : "none",
        background: "rgba(255,255,255,0.78)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: compact ? "stretch" : "flex-start",
          gap: 12,
          flexDirection: compact ? "column" : "row",
        }}
      >
        <div>
          <Typography.Text
            type="secondary"
            style={{
              display: "block",
              marginBottom: 4,
              fontSize: 12,
            }}
          >
            对话运行台
          </Typography.Text>
          <Typography.Title level={4} style={{ margin: 0 }}>
            会话列表
          </Typography.Title>
          <Typography.Text type="secondary">
            共 {conversations.length} 个会话
          </Typography.Text>
        </div>
        <Space size={8} wrap style={{ width: compact ? "100%" : undefined }}>
          <Button size="small" autoInsertSpace={false} onClick={() => navigate("/eval")}>
            评测
          </Button>
          <Button
            type="primary"
            size="small"
            autoInsertSpace={false}
            onClick={onCreate}
            disabled={busy}
          >
            新建
          </Button>
        </Space>
      </div>

      <Card size="small">
        <Space direction="vertical" size={6} style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            {activeConversation ? "当前会话" : "工作区状态"}
          </Typography.Text>
          {activeConversation ? (
            <>
              <Typography.Title level={5} style={{ margin: 0 }}>
                {activeConversation.conversation_id.slice(0, 8)}
              </Typography.Title>
              <Space size={8} wrap>
                <Tag color={formatStatusColor(activeConversation.execution_status)}>
                  {formatStatusLabel(activeConversation.execution_status)}
                </Tag>
                <Typography.Text type="secondary">
                  更新于{" "}
                  {formatRelativeConversationTime(
                    activeConversation.last_event_at ?? activeConversation.updated_at,
                  )}
                </Typography.Text>
              </Space>
            </>
          ) : (
            <Typography.Paragraph style={{ margin: 0 }}>
              新建一个会话后，这里会展示当前线程状态和最近更新时间。
            </Typography.Paragraph>
          )}
        </Space>
      </Card>

      <List
        split={false}
        dataSource={conversations}
        style={{ flex: 1, minHeight: 0, overflow: "auto" }}
        locale={{
          emptyText: (
            <Space direction="vertical" size={12} style={{ padding: "20px 8px", width: "100%" }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有会话" />
              <Button type="primary" autoInsertSpace={false} onClick={onCreate} disabled={busy}>
                新建首个会话
              </Button>
            </Space>
          ),
        }}
        renderItem={(conversation) => {
          const isActive = conversation.conversation_id === activeConversationId;

          return (
            <List.Item style={{ padding: 0, borderBlockEnd: 0, width: "100%", marginBottom: 8 }}>
              <Card
                size="small"
                hoverable
                onClick={() => onSelect(conversation.conversation_id)}
                style={{
                  width: "100%",
                  borderColor: isActive ? "#91caff" : undefined,
                  background: isActive ? "#f0f7ff" : undefined,
                }}
                styles={{ body: { padding: "10px 12px" } }}
              >
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <Space size={8} wrap>
                      <Typography.Text strong style={{ letterSpacing: "0.04em" }}>
                        {conversation.conversation_id.slice(0, 8)}
                      </Typography.Text>
                      <Tag color={formatStatusColor(conversation.execution_status)}>
                        {formatStatusLabel(conversation.execution_status)}
                      </Tag>
                    </Space>
                    <Button
                      type="text"
                      danger
                      size="small"
                      autoInsertSpace={false}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(conversation.conversation_id);
                      }}
                      disabled={busy}
                    >
                      删除
                    </Button>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    更新于{" "}
                    {formatRelativeConversationTime(
                      conversation.last_event_at ?? conversation.updated_at,
                    )}
                  </Typography.Text>
                </Space>
              </Card>
            </List.Item>
          );
        }}
      />
    </div>
  );
}
