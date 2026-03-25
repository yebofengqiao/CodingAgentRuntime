export type TermDefinition = {
  label: string;
  description?: string | null;
};

const TERMS: Record<string, TermDefinition> = {
  "page.evaluation_console": {
    label: "Evaluation Console",
    description: "评测总览与调度入口。",
  },
  "page.create_experiment": {
    label: "Create Experiment",
    description: "创建新的实验配置，组合 Case、Variant 与 Replica。",
  },
  "page.experiment_detail": {
    label: "Experiment Detail",
    description: "查看单个实验的聚合结果、运行明细与执行轨迹。",
  },
  "nav.experiments": {
    label: "Experiments",
    description: "查看实验列表、进度与结果概览。",
  },
  "nav.create": {
    label: "Create",
    description: "创建新的实验。",
  },
  "section.strategy_matrix": {
    label: "Strategy Matrix",
    description: "展示每个 Variant 的核心策略配置。",
  },
  "section.variant_summary": {
    label: "Variant Summary",
    description: "按 Variant 汇总成功率、耗时与诊断分布。",
  },
  "section.family_axis_breakdown": {
    label: "Family / Axis Breakdown",
    description: "按任务族与调优轴拆解通过率。",
  },
  "section.skill_activation_summary": {
    label: "Skill Activation Summary",
    description: "汇总 Skill 的配置、加载与激活情况。",
  },
  "section.diagnosis_summary": {
    label: "Diagnosis Summary",
    description: "汇总失败分类、归因与调优建议。",
  },
  "section.package_funnel": {
    label: "Package Funnel",
    description: "展示 Package 从配置到激活的漏斗状态。",
  },
  "section.run_matrix": {
    label: "Run Matrix",
    description: "按 Case × Variant × Replica 展示每次运行。",
  },
  "section.aggregate_report": {
    label: "Aggregate Report",
    description: "导出实验级 Markdown 与 CSV 报告。",
  },
  "section.execution_timeline": {
    label: "Timeline",
    description: "查看单次 Run 的事件时间线。",
  },
  "field.mode": {
    label: "Mode",
    description: "实验运行模式。",
  },
  "field.replica": {
    label: "Replica",
    description: "同一 Case × Variant 的重复运行编号。",
  },
  "field.case": {
    label: "Case",
    description: "评测案例。",
  },
  "field.cases": {
    label: "Cases",
    description: "本次实验包含的评测案例集合。",
  },
  "field.variant": {
    label: "Variant",
    description: "实验中的策略或业务优化变体。",
  },
  "field.variants": {
    label: "Variants",
    description: "实验中参与对比的变体集合。",
  },
  "field.baseline": {
    label: "Baseline",
    description: "本次实验的基线变体。",
  },
  "field.comparison_variants": {
    label: "Variants",
    description: "本次实验中与 Baseline 对比的变体集合。",
  },
  "field.prompt": {
    label: "Prompt",
    description: "提示词配置轴或版本。",
  },
  "field.model": {
    label: "Model",
    description: "模型配置。",
  },
  "field.business_context": {
    label: "Business Context",
    description: "业务上下文配置。",
  },
  "field.session_context": {
    label: "Session Context",
    description: "会话上下文与压缩策略。",
  },
  "field.package": {
    label: "Package",
    description: "业务优化中注入的上下文包。",
  },
  "field.packages": {
    label: "Packages",
    description: "注入到实验运行时的上下文包集合。",
  },
  "field.skill": {
    label: "Skill",
    description: "运行时可用或被激活的技能条目。",
  },
  "field.skills": {
    label: "Skills",
    description: "技能集合。",
  },
  "field.failure_bucket": {
    label: "Failure Bucket",
    description: "失败现象分类。",
  },
  "field.gap_bucket": {
    label: "Gap Bucket",
    description: "调优缺口归因分类。",
  },
  "field.root_cause": {
    label: "Root Cause",
    description: "更接近业务语义的根因分类。",
  },
  "field.loaded": {
    label: "Loaded",
    description: "已进入运行时上下文或提示词装配。",
  },
  "field.activated": {
    label: "Activated",
    description: "已真正触发或作为 always-on 内容生效。",
  },
  "field.configured": {
    label: "Configured",
    description: "已在策略或 Package 中配置。",
  },
  "field.status": {
    label: "Status",
    description: "当前运行状态。",
  },
  "field.source": {
    label: "Source",
    description: "该项来源于哪类配置。",
  },
  "field.artifacts": {
    label: "Artifacts",
    description: "本次运行产出的结果文件与快照。",
  },
  "field.actions": {
    label: "Actions",
    description: "可执行的页面操作。",
  },
  "field.success_rate": {
    label: "Success Rate",
    description: "通过率。",
  },
  "field.activation_rate": {
    label: "Activation Rate",
    description: "激活率。",
  },
  "field.pass_rate": {
    label: "Pass Rate",
    description: "通过率。",
  },
  "field.stable_pass_rate": {
    label: "Stable Pass Rate",
    description: "多次 Replica 下稳定通过的比例。",
  },
  "field.total_runs": {
    label: "Runs",
    description: "实验中的总运行数。",
  },
  "field.completed": {
    label: "Completed",
    description: "已完成的运行数。",
  },
  "field.running": {
    label: "Running",
    description: "当前仍在运行中的实验数。",
  },
  "field.experiments": {
    label: "Experiments",
    description: "实验数量。",
  },
  "field.type": {
    label: "Type",
    description: "事件类型。",
  },
  "field.tool": {
    label: "Tool",
    description: "本次事件使用的工具。",
  },
  "field.summary": {
    label: "Summary",
    description: "事件摘要。",
  },
  "field.finish_reason": {
    label: "Finish Reason",
    description: "本次运行结束的原因。",
  },
  "field.trace": {
    label: "Trace",
    description: "运行轨迹原始记录。",
  },
  "field.diff": {
    label: "Diff",
    description: "工作区变更差异。",
  },
  "field.judge": {
    label: "Judge",
    description: "评判结果。",
  },
  "field.runtime_context": {
    label: "Runtime Context",
    description: "运行时解析后的上下文快照。",
  },
  "field.system_prompt": {
    label: "System Prompt",
    description: "最终发送给模型的系统提示词。",
  },
  "field.updated_at": {
    label: "Updated At",
    description: "最近一次更新时间。",
  },
  "field.task_family": {
    label: "Task Family",
    description: "案例所属任务族。",
  },
  "field.tuning_axis": {
    label: "Tuning Axis",
    description: "案例主要调优维度。",
  },
  "field.context_mode": {
    label: "Context Mode",
    description: "案例主要依赖的上下文组织方式。",
  },
  "artifact.result": {
    label: "Result",
    description: "最终结构化结果。",
  },
  "artifact.system_prompt": {
    label: "System Prompt",
    description: "发送给模型的系统提示词。",
  },
  "artifact.runtime_context": {
    label: "Runtime Context",
    description: "解析后的运行时上下文快照。",
  },
  "artifact.trace": {
    label: "Trace",
    description: "运行轨迹。",
  },
  "artifact.diff": {
    label: "Diff",
    description: "代码变更差异。",
  },
  "artifact.judge": {
    label: "Judge",
    description: "评判结果与检查项。",
  },
  "mode.strategy": {
    label: "Strategy",
    description: "比较 Prompt、Context、Skills、Model 等策略配置。",
  },
  "mode.business_fine_tuning": {
    label: "Business FT",
    description: "固定案例下比较上下文包与业务相关调优配置。",
  },
  "axis.baseline": {
    label: "Baseline",
    description: "基线配置，不引入额外变化轴。",
  },
  "axis.business_context": {
    label: "Business Context",
    description: "业务上下文配置轴。",
  },
  "axis.context": {
    label: "Context",
    description: "上下文配置轴。",
  },
  "axis.context_packages": {
    label: "Packages",
    description: "上下文包配置轴。",
  },
  "axis.session_context": {
    label: "Session Context",
    description: "会话上下文配置轴。",
  },
  "axis.prompt": {
    label: "Prompt",
    description: "提示词配置轴。",
  },
  "axis.skills": {
    label: "Skills",
    description: "技能配置轴。",
  },
  "axis.model": {
    label: "Model",
    description: "模型配置轴。",
  },
  "context_mode.repo_context": {
    label: "Repo Context",
    description: "主要依赖仓库级上下文指导。",
  },
  "context_mode.session_context": {
    label: "Session Context",
    description: "主要依赖跨轮会话上下文。",
  },
  "context_mode.structured_task_card": {
    label: "Task Card",
    description: "主要依赖结构化任务卡与提示词。",
  },
  "source.strategy_skill": {
    label: "Strategy Skill",
    description: "来自策略配置中的显式 Skill。",
  },
  "source.skill_package": {
    label: "Skill Package",
    description: "来自 context package 的 Skill。",
  },
  "failure.task_misunderstanding": {
    label: "Task Misunderstanding",
    description: "任务目标或约束理解偏差。",
  },
  "failure.scope_violation": {
    label: "Scope Violation",
    description: "修改越过了允许编辑范围。",
  },
  "failure.repo_navigation_failure": {
    label: "Repo Navigation Failure",
    description: "未能定位到应修改的代码位置。",
  },
  "failure.skill_missing_or_not_triggered": {
    label: "Skill Missing",
    description: "技能未加载或未被触发。",
  },
  "failure.execution_loop_failure": {
    label: "Execution Loop Failure",
    description: "执行过程陷入循环或异常结束。",
  },
  "failure.finish_without_validation": {
    label: "Finish Without Validation",
    description: "未执行必要验证就结束。",
  },
  "failure.build_or_test_regression": {
    label: "Build/Test Regression",
    description: "构建或测试回归。",
  },
  "failure.long_context_forgetting": {
    label: "Long Context Forgetting",
    description: "长链路执行中丢失关键上下文。",
  },
  "failure.approval_blocked": {
    label: "Approval Blocked",
    description: "审批或授权流程阻塞。",
  },
  "failure.environment_error": {
    label: "Environment Error",
    description: "运行环境不可用或配置错误。",
  },
  "failure.sandbox_violation": {
    label: "Sandbox Violation",
    description: "违反沙箱或权限限制。",
  },
  "failure.no_result": {
    label: "No Result",
    description: "没有产出可评估结果。",
  },
  "gap.context_gap": {
    label: "Context Gap",
    description: "上下文信息不足或不准确。",
  },
  "gap.skills_gap": {
    label: "Skills Gap",
    description: "技能内容或触发策略不足。",
  },
  "gap.prompt_gap": {
    label: "Prompt Gap",
    description: "提示词结构或约束不足。",
  },
  "gap.model_gap": {
    label: "Model Gap",
    description: "模型能力或配置不匹配。",
  },
  "gap.workspace_gap": {
    label: "Workspace Gap",
    description: "工作区范围与约束处理不足。",
  },
  "gap.approval_gap": {
    label: "Approval Gap",
    description: "审批链路设计不足。",
  },
  "gap.environment_gap": {
    label: "Environment Gap",
    description: "环境配置或依赖不足。",
  },
  "root.package_not_loaded": {
    label: "Package Not Loaded",
    description: "已配置 Package 但未真正装入运行时。",
  },
  "root.package_not_activated": {
    label: "Package Not Activated",
    description: "Package 已加载但未被实际触发。",
  },
  "root.package_activated_but_instruction_weak": {
    label: "Weak Package Instruction",
    description: "Package 已激活，但内容不足以支撑正确完成任务。",
  },
  "root.package_loaded_but_not_read": {
    label: "Package Not Read",
    description: "Package 已加载，但执行过程中没有真正读取其内容。",
  },
  "root.package_used_but_instruction_weak": {
    label: "Weak Package Instruction",
    description: "Package 被使用，但内容仍不足以支撑正确完成任务。",
  },
  "root.validation_gap": {
    label: "Validation Gap",
    description: "验证步骤缺失或未执行。",
  },
  "root.skill_content_gap": {
    label: "Skill Content Gap",
    description: "Skill 内容不够具体或覆盖不足。",
  },
};

function titleCaseToken(value: string): string {
  const lower = value.toLowerCase();
  if (lower === "ft") {
    return "FT";
  }
  if (lower === "api") {
    return "API";
  }
  if (lower === "llm") {
    return "LLM";
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function humanizeMachineValue(value: string): string {
  return value
    .split(/[._+-]+/g)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(" ");
}

export function getTerm(key: string, fallbackLabel?: string, fallbackDescription?: string): TermDefinition {
  return (
    TERMS[key] ?? {
      label: fallbackLabel?.trim() || humanizeMachineValue(key),
      description: fallbackDescription ?? null,
    }
  );
}
