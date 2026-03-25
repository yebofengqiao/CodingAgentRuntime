import { Alert, Button, Card, Empty, Space, Spin, Statistic, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import { Link } from "react-router-dom";

import { formatDateTime, formatExperimentStatus, formatPercent, statusColor } from "@/shared/lib/format";
import type { ExperimentListItem } from "@/shared/types/evaluation";
import { TermLabel } from "@/shared/ui/TermLabel";

const { Text } = Typography;

type Props = {
  experiments: ExperimentListItem[];
  loading: boolean;
  error: string | null;
  startingExperimentId: string | null;
  onStart: (experimentId: string) => Promise<boolean>;
};

export function ExperimentHistoryTable({
  experiments,
  loading,
  error,
  startingExperimentId,
  onStart,
}: Props) {
  const columns: TableProps<ExperimentListItem>["columns"] = [
    {
      title: <TermLabel termKey="field.experiments" />,
      key: "name",
      width: 320,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.name}</Text>
          <Text type="secondary">
            {record.case_count} 个 Case · {record.variant_count} 个 Variant
          </Text>
        </Space>
      ),
    },
    {
      title: <TermLabel termKey="field.status" />,
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (value: string) => <Tag color={statusColor(value)}>{formatExperimentStatus(value)}</Tag>,
    },
    {
      title: <TermLabel termKey="field.success_rate" />,
      dataIndex: "overall_success_rate",
      key: "overall_success_rate",
      width: 120,
      render: (value: number) => formatPercent(value),
    },
    {
      title: <TermLabel termKey="field.total_runs" />,
      key: "progress",
      width: 100,
      render: (_, record) => `${record.completed_runs + record.failed_runs}/${record.total_runs}`,
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: <TermLabel termKey="field.actions" />,
      key: "action",
      width: 140,
      render: (_, record) => (
        <Space wrap>
          {record.status === "queued" ? (
            <Button
              type="primary"
              size="small"
              loading={startingExperimentId === record.id}
              onClick={() => void onStart(record.id)}
            >
              开始运行
            </Button>
          ) : null}
          <Link to={`/experiments/${record.id}`}>
            <Button type="link" style={{ paddingInline: 0 }}>
              {record.status === "running" ? "实时查看" : "查看实验"}
            </Button>
          </Link>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Card variant="borderless">
        <Space size={24} wrap>
          <Statistic title={<TermLabel termKey="field.experiments" />} value={experiments.length} />
          <Statistic title={<TermLabel termKey="field.completed" />} value={experiments.filter((item) => item.status === "completed").length} />
          <Statistic title={<TermLabel termKey="field.running" />} value={experiments.filter((item) => item.status === "running").length} />
        </Space>
      </Card>

      {error ? <Alert type="error" showIcon message={error} /> : null}
      {experiments.some((item) => item.status === "queued" || item.status === "running") ? (
        <Alert
          type="info"
          showIcon
          message="列表会自动刷新"
          description="存在排队中或运行中的实验时，页面会通过接口轮询增量更新，不会整页刷新。"
        />
      ) : null}

      <Card
        variant="borderless"
        extra={
          <Link to="/create">
            <Button type="primary">创建实验</Button>
          </Link>
        }
      >
        {loading && experiments.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Spin />
          </div>
        ) : experiments.length === 0 ? (
          <Empty description="还没有实验。">
            <Link to="/create">
              <Button type="primary">创建第一个实验</Button>
            </Link>
          </Empty>
        ) : (
          <Table
            rowKey="id"
            size="small"
            className="eval-table"
            columns={columns}
            dataSource={experiments}
            pagination={false}
            scroll={{ x: 960 }}
          />
        )}
      </Card>
    </Space>
  );
}
