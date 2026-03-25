import { Alert, Descriptions, Drawer, Empty, Select, Space, Spin, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";

import { formatDateTime, formatExperimentStatus, statusColor } from "@/shared/lib/format";
import { formatArtifactEmptyText, getRunArtifactLinks } from "@/shared/lib/artifacts";
import type { RunRead, TraceEventRead, RunTraceRead } from "@/shared/types/evaluation";
import { ArtifactLinkList } from "@/shared/ui/ArtifactLinkList";
import { TermLabel } from "@/shared/ui/TermLabel";

const { Paragraph, Text } = Typography;

type Props = {
  open: boolean;
  onClose: () => void;
  runOptions: Array<{ label: string; value: string }>;
  selectedRunId: string | null;
  selectedRun: RunRead | null;
  trace: RunTraceRead | null;
  traceLoading: boolean;
  traceError: string | null;
  traceMissing: boolean;
  onSelectRun: (runId: string) => Promise<void>;
};

function formatTraceEventKind(value: string) {
  switch (value) {
    case "action":
      return "Action";
    case "observation":
      return "Observation";
    case "message":
      return "Message";
    case "conversation_error":
      return "Conversation Error";
    case "agent_error":
      return "Agent Error";
    default:
      return value;
  }
}

function traceEventColor(value: string) {
  switch (value) {
    case "action":
      return "processing";
    case "observation":
      return "cyan";
    case "message":
      return "blue";
    case "conversation_error":
    case "agent_error":
      return "error";
    default:
      return "default";
  }
}

export function RunTimelineDrawer({
  open,
  onClose,
  runOptions,
  selectedRunId,
  selectedRun,
  trace,
  traceLoading,
  traceError,
  traceMissing,
  onSelectRun,
}: Props) {
  const traceColumns: TableProps<TraceEventRead>["columns"] = [
    { title: "#", dataIndex: "index", key: "index", width: 72 },
    {
      title: "时间",
      dataIndex: "timestamp",
      key: "timestamp",
      width: 180,
      render: (value: string | null) => <span style={{ whiteSpace: "nowrap" }}>{formatDateTime(value)}</span>,
    },
    {
      title: <TermLabel termKey="field.type" />,
      dataIndex: "kind",
      key: "kind",
      width: 150,
      render: (value: string) => <Tag color={traceEventColor(value)}>{formatTraceEventKind(value)}</Tag>,
    },
    { title: <TermLabel termKey="field.source" />, dataIndex: "source", key: "source", width: 120 },
    {
      title: <TermLabel termKey="field.tool" />,
      dataIndex: "tool_name",
      key: "tool_name",
      width: 140,
      render: (value: string | null) => value ?? "-",
    },
    { title: <TermLabel termKey="field.summary" />, dataIndex: "summary", key: "summary", ellipsis: true },
  ];

  return (
    <Drawer
      title={<TermLabel termKey="section.execution_timeline" />}
      placement="right"
      width="80vw"
      open={open}
      onClose={onClose}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Select
            value={selectedRunId ?? undefined}
            options={runOptions}
            onChange={(value) => void onSelectRun(value)}
            style={{ minWidth: 320 }}
            placeholder="选择要查看的 Run"
          />
          {selectedRun ? (
            <Tag color={statusColor(selectedRun.status)}>
              {selectedRun.case_id} · {selectedRun.variant_id} · {formatExperimentStatus(selectedRun.status)}
            </Tag>
          ) : null}
        </Space>

        {traceError ? <Alert type="error" showIcon message={traceError} /> : null}
        {trace?.derived.parse_warnings ? (
          <Alert type="warning" showIcon message={`轨迹解析时跳过了 ${trace.derived.parse_warnings} 条无效记录。`} />
        ) : null}

        {traceLoading && trace == null ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <Spin />
          </div>
        ) : selectedRun == null ? (
          <Empty description="当前实验没有可展示的 Run。" />
        ) : traceMissing ? (
          <Empty description="该 Run 的 Timeline 暂未生成。" />
        ) : trace == null ? (
          <Empty description="暂无可展示的 Timeline。" />
        ) : (
          <>
            <Descriptions
              size="small"
              column={1}
              items={[
                { key: "finish_reason", label: <TermLabel termKey="field.finish_reason" />, children: trace.derived.finish_reason },
                { key: "tool_call_count", label: "工具调用数", children: trace.derived.tool_call_count },
                {
                  key: "artifacts",
                  label: <TermLabel termKey="field.artifacts" />,
                  children: <ArtifactLinkList items={getRunArtifactLinks(selectedRun)} emptyText={formatArtifactEmptyText(selectedRun.status)} />,
                },
                {
                  key: "used_tools",
                  label: <TermLabel termKey="field.tool" />,
                  children:
                    trace.derived.used_tools.length > 0 ? (
                      <Space wrap>
                        {trace.derived.used_tools.map((tool) => (
                          <Tag key={tool}>{tool}</Tag>
                        ))}
                      </Space>
                    ) : (
                      "无"
                    ),
                },
                {
                  key: "validations_run",
                  label: "验证命令",
                  children:
                    trace.derived.validations_run.length > 0 ? (
                      <Space direction="vertical" size={4}>
                        {trace.derived.validations_run.map((command) => (
                          <Text code key={command}>
                            {command}
                          </Text>
                        ))}
                      </Space>
                    ) : (
                      "无"
                    ),
                },
                {
                  key: "final_message",
                  label: "最终消息",
                  children: trace.derived.final_message || "无",
                },
              ]}
            />

            <Table
              rowKey="index"
              size="small"
              className="eval-table"
              columns={traceColumns}
              dataSource={trace.events}
              pagination={false}
              scroll={{ x: 1080 }}
              expandable={{
                rowExpandable: (record) => Object.keys(record.payload).length > 0,
                expandedRowRender: (record) => (
                  <Paragraph style={{ margin: 0, whiteSpace: "pre-wrap" }} code>
                    {JSON.stringify(record.payload, null, 2)}
                  </Paragraph>
                ),
              }}
            />
          </>
        )}
      </Space>
    </Drawer>
  );
}
