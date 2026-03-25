import { useMemo, useState } from "react";
import { Alert, Button, Card, Descriptions, Empty, Space, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import { Link } from "react-router-dom";

import { getArtifactUrl, getExperimentReportUrl } from "@/shared/api/evaluation-client";
import { formatArtifactEmptyText, getRunArtifactLinks } from "@/shared/lib/artifacts";
import {
  formatChangedAxis,
  formatDateTime,
  formatExperimentStatus,
  formatFailureBucketLabel,
  formatFailureBucketLabels,
  formatGapBucketLabels,
  formatMode,
  formatPercent,
  formatRootCauseLabels,
  formatSkillSource,
  formatTuningAxis,
  statusColor,
} from "@/shared/lib/format";
import { getTerm } from "@/shared/lib/terms";
import type {
  CatalogVariantSummary,
  DesignSnapshot,
  RunRead,
  RunTraceRead,
  VariantAggregateSummary,
} from "@/shared/types/evaluation";
import { ArtifactLinkList } from "@/shared/ui/ArtifactLinkList";
import { CompactTagList } from "@/shared/ui/CompactTagList";
import { TermLabel } from "@/shared/ui/TermLabel";

import { RunTimelineDrawer } from "@/features/run-timeline/ui/RunTimelineDrawer";

const { Text } = Typography;

const cancellableRunStatuses = new Set([
  "queued",
  "preparing_workspace",
  "building_prompt",
  "running_agent",
  "judging",
  "writing_artifacts",
  "cancelling",
]);

const rerunnableRunStatuses = new Set(["completed", "failed", "cancelled"]);

const overflowTagLimit = 3;

type Props = {
  experimentId: string;
  experiment: {
    id: string;
    name: string;
    mode: "strategy" | "business_fine_tuning";
    status: string;
    replica_count: number;
    case_ids: string[];
    baseline_variant_id: string;
    comparison_variant_ids: string[];
    total_runs: number;
    completed_runs: number;
    failed_runs: number;
    aggregate_payload: Record<string, unknown>;
    report_paths: Record<string, string>;
    runs: RunRead[];
    updated_at: string;
  } | null;
  loading: boolean;
  starting: boolean;
  activeRunActionId: string | null;
  error: string | null;
  selectedRunId: string | null;
  selectedRun: RunRead | null;
  variantRows: VariantAggregateSummary[];
  runOptions: Array<{ label: string; value: string }>;
  trace: {
    trace: RunTraceRead | null;
    traceLoading: boolean;
    traceError: string | null;
    traceMissing: boolean;
  };
  onStartExperiment: () => Promise<boolean>;
  onStartRun: (runId: string) => Promise<boolean>;
  onRerunRun: (runId: string) => Promise<boolean>;
  onCancelRun: (runId: string) => Promise<boolean>;
  onSelectRun: (runId: string) => Promise<void>;
};

type BreakdownRow = {
  key: string;
  group: string;
  count: number;
  variants: Record<string, number>;
};

type AggregateView = {
  mode?: "strategy" | "business_fine_tuning";
  replica_count?: number;
  overall_success_rate?: number;
  stable_pass_rate?: number;
  design_snapshot?: DesignSnapshot;
  pass_rate_by_family?: Record<string, { count: number; variants: Record<string, number> }>;
  pass_rate_by_axis?: Record<string, { count: number; variants: Record<string, number> }>;
  failure_bucket_counts?: Record<string, number>;
  gap_bucket_counts?: Record<string, number>;
  skill_hit_summary?: Record<string, Record<string, unknown>>;
  package_funnel_summary?: Record<string, Record<string, number>>;
  root_cause_distribution?: Record<string, number>;
  case_variant_summaries?: Array<Record<string, unknown>>;
  side_effect_summary?: Record<string, unknown>;
  tuning_recommendations?: string[];
};

function collectRunSkills(run: RunRead) {
  const observations = ((run.result_payload ?? {}) as { skill_observations?: Record<string, unknown> })
    .skill_observations ?? {};
  const payload = (run.result_payload ?? {}) as Record<string, unknown>;
  const activatedSkills = Array.isArray(observations.activated_skills)
    ? (observations.activated_skills as string[])
    : [];
  const activatedSkillPackages = Array.isArray(observations.activated_skill_packages)
    ? (observations.activated_skill_packages as string[])
    : Array.isArray(payload.package_observations)
      ? (payload.package_observations as Array<Record<string, unknown>>)
          .filter((item) => String(item.ref ?? "").startsWith("skill/") && item.activated === true)
          .map((item) => String(item.ref ?? ""))
    : [];
  const loadedSkills = Array.isArray(observations.loaded_skills)
    ? (observations.loaded_skills as string[])
    : [];
  const loadedSkillPackages = Array.isArray(observations.loaded_skill_packages)
    ? (observations.loaded_skill_packages as string[])
    : Array.isArray(payload.loaded_packages)
      ? (payload.loaded_packages as string[]).filter((item) => item.startsWith("skill/"))
      : [];

  return {
    loaded: [...new Set([...loadedSkills, ...loadedSkillPackages])],
    activated: [...new Set([...activatedSkills, ...activatedSkillPackages])],
  };
}

function renderEllipsisText(value: string | null | undefined, maxWidth = 220) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return <Text type="secondary">-</Text>;
  }
  return (
    <Tooltip title={normalized}>
      <span className="table-ellipsis" style={{ maxWidth }}>
        {normalized}
      </span>
    </Tooltip>
  );
}

function formatCountEntries(
  values: Record<string, number> | undefined,
  formatLabel: (value: string) => string,
) {
  return Object.entries(values ?? {})
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => `${formatLabel(key)} × ${count}`);
}

function buildBreakdownRows(
  source: Record<string, { count: number; variants: Record<string, number> }> | undefined,
): BreakdownRow[] {
  return Object.entries(source ?? {}).map(([group, value]) => ({
    key: group,
    group,
    count: value.count,
    variants: value.variants,
  }));
}

function fallbackStrategyRows(variantRows: VariantAggregateSummary[]): CatalogVariantSummary[] {
  return variantRows.map((item) => ({
    id: item.variant_id,
    kind: "strategy",
    description: "",
    changed_axis: item.changed_axis,
    prompt_version: item.prompt_version,
    model_profile: item.model_profile,
    business_context_profile: item.business_context_profile,
    session_context_policy: item.session_context_policy,
    package_refs: item.package_refs ?? [],
    source_path: "",
  }));
}

export function ExperimentDetailView({
  experimentId,
  experiment,
  loading,
  starting,
  activeRunActionId,
  error,
  selectedRunId,
  selectedRun,
  variantRows,
  runOptions,
  trace,
  onStartExperiment,
  onStartRun,
  onRerunRun,
  onCancelRun,
  onSelectRun,
}: Props) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const aggregate = (experiment?.aggregate_payload ?? {}) as AggregateView;
  const designSnapshot = aggregate.design_snapshot;
  const strategyRows = designSnapshot?.variants ?? fallbackStrategyRows(variantRows);
  const strategyVariantIds = strategyRows.map((item) => item.id);
  const familyRows = buildBreakdownRows(aggregate.pass_rate_by_family);
  const axisRows = buildBreakdownRows(aggregate.pass_rate_by_axis).map((item) => ({
    ...item,
    group: formatTuningAxis(item.group),
  }));

  const breakdownColumns = useMemo<TableProps<BreakdownRow>["columns"]>(
    () => [
      { title: <TermLabel termKey="field.task_family" />, dataIndex: "group", key: "group" },
      { title: <TermLabel termKey="field.cases" />, dataIndex: "count", key: "count", width: 96 },
      ...strategyVariantIds.map((variantId) => ({
        title: variantId,
        key: variantId,
        render: (_value: unknown, record: BreakdownRow) => formatPercent(record.variants[variantId] ?? 0),
      })),
    ],
    [strategyVariantIds],
  );

  const runsColumns: TableProps<RunRead>["columns"] = useMemo(
    () => [
      { title: <TermLabel showHint={false} termKey="field.case" />, dataIndex: "case_id", key: "case_id", width: 120, fixed: 'left' },
      { title: <TermLabel showHint={false} termKey="field.variant" />, dataIndex: "variant_id", key: "variant_id", width: 150, fixed: 'left' },
      { title: <TermLabel showHint={false} termKey="field.replica" />, dataIndex: "replica_index", key: "replica_index", width: 90 },
      {
        title: <TermLabel showHint={false} termKey="field.status" />,
        dataIndex: "status",
        key: "status",
        width: 120,
        render: (value: string) => <Tag color={statusColor(value)}>{formatExperimentStatus(value)}</Tag>,
      },
      {
        title: <TermLabel termKey="field.failure_bucket" />,
        dataIndex: "failure_bucket",
        key: "failure_bucket",
        width: 240,
        render: (value: string[]) => (
          <CompactTagList
            items={formatFailureBucketLabels(value)}
            emptyText="通过"
            maxVisible={2}
            color="error"
          />
        ),
      },
      {
        title: <TermLabel termKey="field.gap_bucket" />,
        dataIndex: "suspected_gap",
        key: "suspected_gap",
        width: 220,
        render: (value: string[]) => (
          <CompactTagList items={formatGapBucketLabels(value)} maxVisible={2} color="processing" />
        ),
      },
      {
        title: <TermLabel termKey="field.root_cause" />,
        dataIndex: "suspected_root_cause",
        key: "suspected_root_cause",
        width: 240,
        render: (value: string[]) => (
          <CompactTagList items={formatRootCauseLabels(value)} maxVisible={2} color="orange" />
        ),
      },
      {
        title: <TermLabel termKey="field.loaded" />,
        key: "skills_loaded",
        width: 260,
        render: (_value: unknown, record: RunRead) => (
          <CompactTagList items={collectRunSkills(record).loaded} maxVisible={overflowTagLimit} />
        ),
      },
      {
        title: <TermLabel termKey="field.activated" />,
        key: "skills_activated",
        width: 220,
        render: (_value: unknown, record: RunRead) => (
          <CompactTagList items={collectRunSkills(record).activated} maxVisible={2} color="success" />
        ),
      },
      {
        title: <TermLabel termKey="field.artifacts" />,
        key: "artifacts",
        fixed: 'right',
        width: 260,
        render: (_, record) => {
          return (
            <ArtifactLinkList
              items={getRunArtifactLinks(record)}
              emptyText={formatArtifactEmptyText(record.status)}
            />
          );
        },
      },
      {
        title: <TermLabel termKey="field.actions" />,
        key: "actions",
        fixed: 'right',
        width: 100,
        render: (_, record) => (
          <Space wrap>
            {record.status === "queued" ? (
              <Button
                size="small"
                type="primary"
                loading={activeRunActionId === record.id}
                onClick={() => void onStartRun(record.id)}
              >
                开始此运行
              </Button>
            ) : null}
            {rerunnableRunStatuses.has(record.status) ? (
              <Button size="small" loading={activeRunActionId === record.id} onClick={() => void onRerunRun(record.id)}>
                重新运行
              </Button>
            ) : null}
            {cancellableRunStatuses.has(record.status) ? (
              <Button
                danger={record.status !== "cancelling"}
                size="small"
                loading={activeRunActionId === record.id}
                disabled={record.status === "cancelling"}
                onClick={() => void onCancelRun(record.id)}
              >
                {record.status === "cancelling" ? "取消中" : "取消运行"}
              </Button>
            ) : null}
            <Button
              size="small"
              type="link"
              style={{ paddingInline: 0 }}
              onClick={() => {
                void onSelectRun(record.id);
                setTimelineOpen(true);
              }}
            >
              查看时间线
            </Button>
          </Space>
        ),
      },
    ],
    [activeRunActionId, onCancelRun, onRerunRun, onSelectRun, onStartRun],
  );

  return (
    <>
      {error ? <Alert type="error" showIcon message={error} /> : null}

      {loading && !experiment ? (
        <Card variant="borderless">
          <div style={{ padding: 48, textAlign: "center" }}>加载中…</div>
        </Card>
      ) : experiment == null ? (
        <Card variant="borderless">
          <Empty description="未找到对应实验。" />
        </Card>
      ) : (
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <Card
            variant="borderless"
            extra={
              <Space wrap>
                <Link to="/">
                  <Button>返回实验列表</Button>
                </Link>
                <Link to="/create">
                  <Button>创建实验</Button>
                </Link>
                {experiment.status === "queued" ? (
                  <Button type="primary" loading={starting} onClick={() => void onStartExperiment()}>
                    开始运行
                  </Button>
                ) : null}
              </Space>
            }
          >
            <Space size={24} wrap>
              <Statistic title={<TermLabel termKey="field.status" />} value={formatExperimentStatus(experiment.status)} />
              <Statistic title={<TermLabel termKey="field.total_runs" />} value={experiment.total_runs} />
              <Statistic
                title={<TermLabel termKey="field.completed" />}
                value={experiment.completed_runs + experiment.failed_runs}
                suffix={`/ ${experiment.total_runs}`}
              />
              <Statistic
                title={<TermLabel termKey="field.success_rate" />}
                value={formatPercent(Number(aggregate.overall_success_rate ?? 0))}
              />
              {experiment.mode === "business_fine_tuning" ? (
                <Statistic
                  title={<TermLabel termKey="field.stable_pass_rate" />}
                  value={formatPercent(Number(aggregate.stable_pass_rate ?? 0))}
                />
              ) : null}
            </Space>
          </Card>

          {experiment.status === "queued" || experiment.status === "running" ? (
            <Alert
              type="info"
              showIcon
              message="页面实时刷新中"
              description={
                <>
                  <TermLabel termKey="section.run_matrix" />、指标卡与 <TermLabel termKey="section.execution_timeline" /> 会通过接口轮询更新，不会整页刷新。
                </>
              }
            />
          ) : null}

          <Card variant="borderless">
            <Descriptions
              size="small"
              column={1}
              items={[
                { key: "name", label: "实验名称", children: experiment.name },
                {
                  key: "baseline",
                  label: <TermLabel termKey="field.baseline" />,
                  children: experiment.baseline_variant_id,
                },
                {
                  key: "mode",
                  label: <TermLabel termKey="field.mode" />,
                  children: formatMode(experiment.mode),
                },
                {
                  key: "replica_count",
                  label: <TermLabel termKey="field.replica" />,
                  children: experiment.replica_count,
                },
                {
                  key: "comparisons",
                  label: <TermLabel termKey="field.variants" />,
                  children: <CompactTagList items={experiment.comparison_variant_ids} maxVisible={overflowTagLimit} />,
                },
                {
                  key: "cases",
                  label: <TermLabel termKey="field.cases" />,
                  children: <CompactTagList items={experiment.case_ids} maxVisible={overflowTagLimit} />,
                },
                {
                  key: "updated",
                  label: "更新时间",
                  children: formatDateTime(experiment.updated_at),
                },
              ]}
            />
          </Card>

          <Card title={<TermLabel termKey="section.strategy_matrix" />} variant="borderless">
            <Table
              size="small"
              className="eval-table"
              rowKey={(record) => String(record.id)}
              pagination={false}
              dataSource={strategyRows}
              scroll={{ x: 1080 }}
              columns={[
                { title: <TermLabel termKey="field.variant" />, dataIndex: "id", key: "id", width: 220 },
                {
                  title: <TermLabel termKey="field.tuning_axis" />,
                  dataIndex: "changed_axis",
                  key: "changed_axis",
                  width: 170,
                  render: (value: string) => <Tag>{formatChangedAxis(value)}</Tag>,
                },
                {
                  title: <TermLabel termKey="field.prompt" />,
                  dataIndex: "prompt_version",
                  key: "prompt_version",
                  render: (value: string) => renderEllipsisText(value),
                },
                {
                  title: <TermLabel termKey="field.model" />,
                  dataIndex: "model_profile",
                  key: "model_profile",
                  render: (value: string) => renderEllipsisText(value),
                },
                {
                  title: <TermLabel termKey="field.business_context" />,
                  dataIndex: "business_context_profile",
                  key: "business_context_profile",
                  render: (value: string) => renderEllipsisText(value),
                },
                {
                  title: <TermLabel termKey="field.session_context" />,
                  dataIndex: "session_context_policy",
                  key: "session_context_policy",
                  render: (value: string) => renderEllipsisText(value),
                },
                {
                  title: <TermLabel termKey="field.packages" />,
                  dataIndex: "package_refs",
                  key: "package_refs",
                  render: (value: string[] | undefined) =>
                    <CompactTagList items={value ?? []} maxVisible={overflowTagLimit} />,
                },
              ]}
            />
          </Card>

          <Card title={<TermLabel termKey="section.variant_summary" />} variant="borderless">
            <Table
              size="small"
              className="eval-table"
              rowKey={(record) => String(record.variant_id)}
              pagination={false}
              dataSource={variantRows}
              scroll={{ x: 1080 }}
              columns={[
                { title: <TermLabel termKey="field.variant" />, dataIndex: "variant_id", key: "variant_id", width: 220 },
                {
                  title: <TermLabel termKey="field.tuning_axis" />,
                  dataIndex: "changed_axis",
                  key: "changed_axis",
                  width: 170,
                  render: (value: string) => <Tag>{formatChangedAxis(value)}</Tag>,
                },
                {
                  title: <TermLabel termKey="field.success_rate" />,
                  dataIndex: "success_rate",
                  key: "success_rate",
                  width: 120,
                  render: (value: number) => formatPercent(value),
                },
                {
                  title: "平均耗时",
                  dataIndex: "avg_duration_seconds",
                  key: "avg_duration_seconds",
                  width: 120,
                  render: (value: number) => `${value.toFixed(2)}s`,
                },
                {
                  title: <TermLabel termKey="field.packages" />,
                  dataIndex: "package_refs",
                  key: "package_refs",
                  render: (value: string[] | undefined) =>
                    <CompactTagList items={value ?? []} maxVisible={2} />,
                },
                {
                  title: <TermLabel termKey="field.failure_bucket" />,
                  dataIndex: "failure_bucket_counts",
                  key: "failure_bucket_counts",
                  render: (value: Record<string, number>) =>
                    <CompactTagList items={formatCountEntries(value, formatFailureBucketLabel)} maxVisible={2} color="error" />,
                },
                {
                  title: <TermLabel termKey="field.gap_bucket" />,
                  dataIndex: "gap_bucket_counts",
                  key: "gap_bucket_counts",
                  render: (value: Record<string, number>) =>
                    <CompactTagList items={formatCountEntries(value, (item) => getTerm(`gap.${item}`, item).label)} maxVisible={2} color="processing" />,
                },
              ]}
            />
          </Card>

          <Card title={<TermLabel termKey="section.family_axis_breakdown" />} variant="borderless">
            <Space direction="vertical" size={20} style={{ width: "100%" }}>
              <div>
                <Text strong>
                  <TermLabel termKey="field.task_family" />
                </Text>
                <Table
                  rowKey={(record) => record.key}
                  className="eval-table"
                  size="small"
                  style={{ marginTop: 12 }}
                  pagination={false}
                  dataSource={familyRows}
                  columns={breakdownColumns}
                />
              </div>
              <div>
                <Text strong>
                  <TermLabel termKey="field.tuning_axis" />
                </Text>
                <Table
                  rowKey={(record) => record.key}
                  className="eval-table"
                  size="small"
                  style={{ marginTop: 12 }}
                  pagination={false}
                  dataSource={axisRows}
                  columns={breakdownColumns}
                />
              </div>
            </Space>
          </Card>

          <Card title={<TermLabel termKey="section.skill_activation_summary" />} variant="borderless">
            <Table
              size="small"
              className="eval-table"
              rowKey={(record) => String(record.key)}
              pagination={false}
              dataSource={Object.entries(aggregate.skill_hit_summary ?? {}).map(([key, value]) => ({
                key,
                ...(value as Record<string, unknown>),
              }))}
              scroll={{ x: 920 }}
              columns={[
                { title: <TermLabel termKey="field.skill" />, dataIndex: "key", key: "key", render: (value: string) => renderEllipsisText(value, 260) },
                { title: <TermLabel termKey="field.source" />, dataIndex: "source", key: "source", render: (value: string) => <Tag>{formatSkillSource(value)}</Tag> },
                { title: <TermLabel termKey="field.configured" />, dataIndex: "configured_count", key: "configured_count", width: 110 },
                { title: <TermLabel termKey="field.loaded" />, dataIndex: "loaded_count", key: "loaded_count", width: 96 },
                { title: <TermLabel termKey="field.activated" />, dataIndex: "hit_count", key: "hit_count", width: 104 },
                {
                  title: <TermLabel termKey="field.activation_rate" />,
                  dataIndex: "hit_rate",
                  key: "hit_rate",
                  width: 128,
                  render: (value: number) => formatPercent(value),
                },
                {
                  title: "Success When Activated",
                  dataIndex: "success_when_hit_rate",
                  key: "success_when_hit_rate",
                  width: 156,
                  render: (value: number) => formatPercent(value),
                },
              ]}
            />
          </Card>

          <Card title={<TermLabel termKey="section.diagnosis_summary" />} variant="borderless">
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div>
                <Text strong>
                  <TermLabel termKey="field.failure_bucket" />
                </Text>
                <div style={{ marginTop: 8 }}>
                  {Object.entries(aggregate.failure_bucket_counts ?? {}).length === 0 ? (
                    <Text type="secondary">暂无失败分类。</Text>
                  ) : (
                    <CompactTagList
                      items={formatCountEntries(aggregate.failure_bucket_counts, formatFailureBucketLabel)}
                      maxVisible={4}
                      color="error"
                    />
                  )}
                </div>
              </div>
              <div>
                <Text strong>
                  <TermLabel termKey="field.gap_bucket" />
                </Text>
                <div style={{ marginTop: 8 }}>
                  {Object.entries(aggregate.gap_bucket_counts ?? {}).length === 0 ? (
                    <Text type="secondary">暂无调优归因。</Text>
                  ) : (
                    <CompactTagList
                      items={formatCountEntries(aggregate.gap_bucket_counts, (item) => getTerm(`gap.${item}`, item).label)}
                      maxVisible={4}
                      color="processing"
                    />
                  )}
                </div>
              </div>
              {experiment.mode === "business_fine_tuning" ? (
                <div>
                  <Text strong>
                    <TermLabel termKey="field.root_cause" />
                  </Text>
                  <div style={{ marginTop: 8 }}>
                    {Object.entries(aggregate.root_cause_distribution ?? {}).length === 0 ? (
                      <Text type="secondary">暂无业务优化根因。</Text>
                    ) : (
                      <CompactTagList
                        items={formatCountEntries(aggregate.root_cause_distribution, (item) => getTerm(`root.${item}`, item).label)}
                        maxVisible={4}
                        color="orange"
                      />
                    )}
                  </div>
                </div>
              ) : null}
              <div>
                <Text strong>Tuning Recommendations</Text>
                <div style={{ marginTop: 8 }}>
                  {(aggregate.tuning_recommendations ?? []).length === 0 ? (
                    <Text type="secondary">暂无建议。</Text>
                  ) : (
                    <Space direction="vertical" size={6}>
                      {(aggregate.tuning_recommendations ?? []).map((item) => (
                        <Text key={item}>{item}</Text>
                      ))}
                    </Space>
                  )}
                </div>
              </div>
            </Space>
          </Card>

          {experiment.mode === "business_fine_tuning" ? (
            <Card title={<TermLabel termKey="section.package_funnel" />} variant="borderless">
              <Table
                size="small"
                className="eval-table"
                rowKey={(record) => String(record.ref)}
                pagination={false}
                dataSource={Object.entries(aggregate.package_funnel_summary ?? {}).map(([ref, value]) => ({
                  ref,
                  ...(value as Record<string, unknown>),
                }))}
                scroll={{ x: 840 }}
                columns={[
                  { title: <TermLabel termKey="field.package" />, dataIndex: "ref", key: "ref", render: (value: string) => renderEllipsisText(value, 280) },
                  { title: <TermLabel termKey="field.configured" />, dataIndex: "configured_count", key: "configured_count", width: 110 },
                  { title: <TermLabel termKey="field.loaded" />, dataIndex: "loaded_count", key: "loaded_count", width: 96 },
                  { title: <TermLabel termKey="field.activated" />, dataIndex: "activated_count", key: "activated_count", width: 104 },
                  {
                    title: <TermLabel termKey="field.activation_rate" />,
                    dataIndex: "package_version_hit_rate",
                    key: "package_version_hit_rate",
                    width: 128,
                    render: (value: number) => formatPercent(value),
                  },
                  {
                    title: <TermLabel termKey="field.success_rate" />,
                    dataIndex: "package_version_success_rate",
                    key: "package_version_success_rate",
                    width: 120,
                    render: (value: number) => formatPercent(value),
                  },
                ]}
              />
            </Card>
          ) : null}

          <Card
            title={<TermLabel termKey="section.run_matrix" />}
            variant="borderless"
            extra={
              <Space wrap>
                {selectedRun ? (
                  <Tag color={statusColor(selectedRun.status)}>
                    {selectedRun.case_id} · {selectedRun.variant_id} · {formatExperimentStatus(selectedRun.status)}
                  </Tag>
                ) : null}
                <Button onClick={() => setTimelineOpen(true)} disabled={selectedRun == null}>
                  打开 Timeline
                </Button>
              </Space>
            }
          >
            <Table
              rowKey="id"
              size="small"
              className="eval-table"
              columns={runsColumns}
              dataSource={experiment.runs}
              pagination={false}
              scroll={{ x: 1680 }}
            />
          </Card>

          {experiment.report_paths.report_markdown ? (
            <Card variant="borderless">
              <Space wrap size={[8, 8]}>
                <Text strong>
                  <TermLabel termKey="section.aggregate_report" />：
                </Text>
                <ArtifactLinkList
                  items={[
                    experiment.report_paths.report_markdown
                      ? {
                          key: "report_markdown",
                          label: "Markdown",
                          description: "实验级聚合报告的 Markdown 导出。",
                          href: getExperimentReportUrl(experimentId, "report_markdown"),
                        }
                      : null,
                    experiment.report_paths.report_csv
                      ? {
                          key: "report_csv",
                          label: "CSV",
                          description: "实验级聚合报告的 CSV 导出。",
                          href: getExperimentReportUrl(experimentId, "report_csv"),
                        }
                      : null,
                  ].filter((item): item is { key: string; label: string; description: string; href: string } => item != null)}
                />
              </Space>
            </Card>
          ) : null}
        </Space>
      )}

      <RunTimelineDrawer
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        runOptions={runOptions.map((item) => ({
          ...item,
          label:
            experiment?.runs.find((run) => run.id === item.value) != null
              ? `${experiment.runs.find((run) => run.id === item.value)?.case_id} · ${
                  experiment.runs.find((run) => run.id === item.value)?.variant_id
                } · ${formatExperimentStatus(experiment.runs.find((run) => run.id === item.value)?.status ?? "")}`
              : item.label,
        }))}
        selectedRunId={selectedRunId}
        selectedRun={selectedRun}
        trace={trace.trace}
        traceLoading={trace.traceLoading}
        traceError={trace.traceError}
        traceMissing={trace.traceMissing}
        onSelectRun={onSelectRun}
      />
    </>
  );
}
