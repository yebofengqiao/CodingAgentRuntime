import { getTerm } from "@/shared/lib/terms";

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

export function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "0%";
  }
  return `${(value * 100).toFixed(1)}%`;
}

export function formatExperimentStatus(value: string) {
  switch (value) {
    case "queued":
      return "排队中";
    case "running":
      return "运行中";
    case "preparing_workspace":
      return "准备工作区";
    case "building_prompt":
      return "构建提示词";
    case "running_agent":
      return "执行 Agent";
    case "judging":
      return "评判中";
    case "writing_artifacts":
      return "写入产物";
    case "cancelling":
      return "取消中";
    case "cancelled":
      return "已取消";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return value;
  }
}

export function statusColor(value: string) {
  switch (value) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "cancelling":
      return "warning";
    case "cancelled":
      return "default";
    case "running":
    case "preparing_workspace":
    case "building_prompt":
    case "running_agent":
    case "judging":
    case "writing_artifacts":
      return "processing";
    default:
      return "default";
  }
}

function formatMappedLabel(prefix: string, value: string) {
  return getTerm(`${prefix}.${value}`, value).label;
}

export function formatTuningAxis(value: string) {
  return formatMappedLabel("axis", value);
}

export const formatPrimaryTarget = formatTuningAxis;

export function formatMode(value: string) {
  return formatMappedLabel("mode", value);
}

export function formatContextMode(value: string) {
  return formatMappedLabel("context_mode", value);
}

export function formatDifficulty(value: string) {
  switch (value) {
    case "simple":
      return "简单";
    case "medium":
      return "中等";
    case "complex":
      return "复杂";
    default:
      return value;
  }
}

export function formatChangedAxis(value: string) {
  return formatMappedLabel("axis", value);
}

export function formatFailureBucketLabel(value: string) {
  return formatMappedLabel("failure", value);
}

export function formatFailureBucketLabels(values: string[]) {
  return values.map((value) => formatFailureBucketLabel(value));
}

export function formatFailureBuckets(values: string[]) {
  if (values.length === 0) {
    return "通过";
  }
  return formatFailureBucketLabels(values).join("，");
}

export const formatFailureTaxonomy = formatFailureBuckets;

export function formatGapBucketLabel(value: string) {
  return formatMappedLabel("gap", value);
}

export function formatGapBucketLabels(values: string[]) {
  return values.map((value) => formatGapBucketLabel(value));
}

export function formatGapBuckets(values: string[]) {
  if (values.length === 0) {
    return "-";
  }
  return formatGapBucketLabels(values).join("，");
}

export function formatRootCauseLabel(value: string) {
  return formatMappedLabel("root", value);
}

export function formatRootCauseLabels(values: string[]) {
  return values.map((value) => formatRootCauseLabel(value));
}

export function formatSkillSource(value: string) {
  return formatMappedLabel("source", value);
}
