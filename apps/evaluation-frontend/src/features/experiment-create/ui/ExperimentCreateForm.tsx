import { Alert, Button, Card, Form, Input, InputNumber, Select, Space, Tag, Typography } from "antd";

import { TermLabel } from "@/shared/ui/TermLabel";

type SelectOption = {
  label: string;
  value: string;
};

type Props = {
  loading: boolean;
  submitting: boolean;
  error: string | null;
  matrixSize: number;
  validationIssues: string[];
  payload: {
    name: string;
    mode?: "strategy" | "business_fine_tuning";
    replica_count?: number;
    case_ids: string[];
    baseline_variant_id: string;
    comparison_variant_ids: string[];
  };
  caseOptions: SelectOption[];
  baselineOptions: SelectOption[];
  comparisonOptions: SelectOption[];
  onNameChange: (value: string) => void;
  onModeChange: (value: "strategy" | "business_fine_tuning") => void;
  onReplicaCountChange: (value: number) => void;
  onCaseIdsChange: (value: string[]) => void;
  onBaselineChange: (value: string) => void;
  onComparisonChange: (value: string[]) => void;
  onCreateOnly: () => Promise<void>;
  onCreateAndRun: () => Promise<void>;
};

const { Paragraph, Text } = Typography;

export function ExperimentCreateForm({
  loading,
  submitting,
  error,
  matrixSize,
  validationIssues,
  payload,
  caseOptions,
  baselineOptions,
  comparisonOptions,
  onNameChange,
  onModeChange,
  onReplicaCountChange,
  onCaseIdsChange,
  onBaselineChange,
  onComparisonChange,
  onCreateOnly,
  onCreateAndRun,
}: Props) {
  if (loading && caseOptions.length === 0 && baselineOptions.length === 0) {
    return (
      <Card variant="borderless">
        <div style={{ padding: 48, textAlign: "center" }}>
          <Space direction="vertical" size={12}>
            <Text type="secondary">
              正在加载 <TermLabel termKey="field.cases" /> 与 <TermLabel termKey="field.variants" /> 目录…
            </Text>
          </Space>
        </div>
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Card variant="borderless">
        <Paragraph style={{ marginBottom: 0 }}>
          系统会把 <TermLabel termKey="field.baseline" /> 与 <TermLabel termKey="field.variants" /> 展开成完整的
          <TermLabel termKey="section.run_matrix" />。当前选择将生成 <Text strong>{matrixSize}</Text> 次运行。
        </Paragraph>
      </Card>

      {error ? <Alert type="error" showIcon message={error} /> : null}
      {validationIssues.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message="表单校验问题"
          description={
            <Space wrap>
              {validationIssues.map((issue) => (
                <Tag key={issue}>{issue}</Tag>
              ))}
            </Space>
          }
        />
      ) : null}

      <Card variant="borderless">
        <Form layout="vertical">
          <Form.Item label="实验名称">
            <Input value={payload.name} onChange={(event) => onNameChange(event.target.value)} />
          </Form.Item>
          <Form.Item label={<TermLabel termKey="field.mode" />}>
            <Select
              value={payload.mode ?? "strategy"}
              options={[
                { label: "Strategy", value: "strategy" },
                { label: "Business FT", value: "business_fine_tuning" },
              ]}
              onChange={onModeChange}
            />
          </Form.Item>
          <Form.Item label={<TermLabel termKey="field.replica" />}>
            <InputNumber
              min={1}
              max={10}
              value={payload.replica_count ?? 1}
              onChange={(value) => onReplicaCountChange(Number(value ?? 1))}
            />
          </Form.Item>
          <Form.Item label={<TermLabel termKey="field.cases" />}>
            <Select
              mode="multiple"
              value={payload.case_ids}
              options={caseOptions}
              onChange={onCaseIdsChange}
              loading={loading}
            />
          </Form.Item>
          <Form.Item label={<TermLabel termKey="field.baseline" />}>
            <Select
              value={payload.baseline_variant_id}
              options={baselineOptions}
              onChange={onBaselineChange}
              loading={loading}
            />
          </Form.Item>
          <Form.Item label={<TermLabel termKey="field.variants" />}>
            <Select
              mode="multiple"
              value={payload.comparison_variant_ids}
              options={comparisonOptions}
              onChange={onComparisonChange}
              loading={loading}
            />
          </Form.Item>
        </Form>
        <Space wrap>
          <Button onClick={() => void onCreateOnly()} loading={submitting}>
            仅创建实验
          </Button>
          <Button type="primary" onClick={() => void onCreateAndRun()} loading={submitting}>
            创建并开始运行
          </Button>
        </Space>
      </Card>
    </Space>
  );
}
