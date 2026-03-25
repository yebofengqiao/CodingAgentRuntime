const STATUS_LABELS: Record<string, string> = {
  idle: "空闲",
  queued: "排队中",
  running: "运行中",
  waiting_approval: "等待审批",
  waiting_for_confirmation: "等待确认",
  paused: "已暂停",
  finished: "已完成",
  error: "异常",
  stuck: "卡住",
};

const EVENT_KIND_LABELS: Record<string, string> = {
  all: "全部",
  message: "消息",
  action: "动作",
  observation: "观察",
  condensation: "上下文压缩",
  user_approve: "用户批准",
  user_reject: "用户拒绝",
  agent_error: "智能体错误",
  conversation_error: "会话错误",
  system_prompt: "系统提示词",
};

const EVENT_SOURCE_LABELS: Record<string, string> = {
  agent: "智能体",
  user: "用户",
  environment: "环境",
};

const STATUS_COLORS: Record<string, string> = {
  idle: "default",
  queued: "processing",
  running: "processing",
  waiting_approval: "warning",
  waiting_for_confirmation: "warning",
  paused: "warning",
  finished: "success",
  error: "error",
  stuck: "error",
};

export function formatStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatEventKindLabel(kind: string): string {
  return EVENT_KIND_LABELS[kind] ?? kind;
}

export function formatEventSourceLabel(source: string): string {
  return EVENT_SOURCE_LABELS[source] ?? source;
}

export function formatStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? "default";
}
