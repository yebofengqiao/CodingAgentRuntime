import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { settings } from "../../config/settings";
import type {
  CaseDefinition,
  PromptBundle,
  ResolvedStrategyBundle,
} from "../schemas";
import { buildExplicitSkill, buildPackageSkill } from "./skill-loader";

function resolveAssetPath(pathValue: string): string {
  return pathValue.startsWith("/")
    ? pathValue
    : resolve(settings.evaluationAssetsRoot, pathValue);
}

function readText(pathValue: string): string {
  return readFileSync(resolveAssetPath(pathValue), "utf-8");
}

function maybeReadText(pathValue: string): string | null {
  const target = resolveAssetPath(pathValue);
  return existsSync(target) ? readFileSync(target, "utf-8") : null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeXmlTag(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function renderXmlTag(
  tag: string,
  content: string,
  options?: {
    attrs?: Record<string, string>;
  },
): string {
  const attrs = Object.entries(options?.attrs ?? {})
    .filter(([, value]) => value.trim())
    .map(([key, value]) => ` ${key}="${escapeXmlAttribute(value)}"`)
    .join("");
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }
  return `<${tag}${attrs}>\n${trimmed}\n</${tag}>`;
}

function renderListTag(tag: string, values: string[]): string {
  if (values.length === 0) {
    return "";
  }
  return renderXmlTag(
    tag,
    values.map((item) => renderXmlTag("ITEM", escapeXmlText(item))).filter(Boolean).join("\n"),
  );
}

function renderDocumentTag(
  tag: string,
  items: Array<{ path: string; text: string }>,
  itemTag = "DOC",
): string {
  if (items.length === 0) {
    return "";
  }
  return renderXmlTag(
    tag,
    items
      .map((item) => renderXmlTag(itemTag, escapeXmlText(item.text), { attrs: { path: item.path } }))
      .filter(Boolean)
      .join("\n\n"),
  );
}

function buildTaskCard(caseDefinition: CaseDefinition, strategy: ResolvedStrategyBundle): Record<string, unknown> {
  if (!strategy.prompt.task_card.enabled) {
    return {};
  }

  const finishChecklist = strategy.prompt.finish_checklist.enabled
    ? strategy.prompt.finish_checklist.items
    : [];
  const sections = strategy.prompt.task_card.include_sections;
  const taskCard: Record<string, unknown> = {};

  for (const section of sections) {
    if (section === "goal") {
      taskCard.goal = `${caseDefinition.name}: ${caseDefinition.requirement_bundle.acceptance_criteria.join(" ")}`;
    } else if (section === "acceptance_criteria" || section === "success_criteria") {
      taskCard.acceptance_criteria = caseDefinition.requirement_bundle.acceptance_criteria;
    } else if (section === "editable_scope") {
      taskCard.editable_scope = caseDefinition.scope.editable_scope;
    } else if (section === "protected_scope") {
      taskCard.protected_scope = caseDefinition.scope.protected_scope;
    } else if (section === "expected_artifacts") {
      taskCard.expected_artifacts = caseDefinition.expected_artifacts;
    } else if (section === "expected_skills") {
      taskCard.expected_skills = caseDefinition.expected_skills;
    } else if (section === "expected_tools") {
      taskCard.expected_tools = caseDefinition.expected_tools;
    } else if (section === "finish_checklist") {
      taskCard.finish_checklist = finishChecklist;
    } else if (section === "task_notes" && strategy.case_bindings.task_notes.length > 0) {
      taskCard.task_notes = strategy.case_bindings.task_notes;
    }
  }

  return taskCard;
}

function renderTaskCard(taskCard: Record<string, unknown>): string {
  const sections = Object.entries(taskCard)
    .map(([key, value]) => {
      const tag = normalizeXmlTag(key);
      if (Array.isArray(value)) {
        return renderXmlTag(
          tag,
          value.map((item) => renderXmlTag("ITEM", escapeXmlText(String(item)))).join("\n"),
        );
      }
      return renderXmlTag(tag, escapeXmlText(String(value)));
    })
    .filter(Boolean)
    .join("\n\n");

  return renderXmlTag("TASK_CARD", sections);
}

function buildEvaluationContract(caseDefinition: CaseDefinition, strategy: ResolvedStrategyBundle): string {
  const checks = caseDefinition.completion_checks
    .map((check) => {
      const detail = check.command
        ? check.command
        : check.path
          ? `path ${check.path}`
          : check.type;
      return renderXmlTag("CHECK", escapeXmlText(detail), {
        attrs: {
          name: check.name,
          type: check.type,
        },
      });
    })
    .filter(Boolean)
    .join("\n");

  return renderXmlTag(
    "EVALUATION_CONTRACT",
    [
      renderXmlTag("RESULT_PATH", ".evaluation/mock-result.json"),
      renderXmlTag("CASE_ID", escapeXmlText(caseDefinition.id)),
      renderXmlTag("VARIANT_ID", escapeXmlText(strategy.variant_id)),
      checks ? renderXmlTag("COMPLETION_CHECKS", checks) : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
}

function sliceIfNeeded(text: string, maxChars?: number | null): string {
  if (maxChars == null || maxChars <= 0 || text.length <= maxChars) {
    return text.trim();
  }
  return text.slice(0, maxChars).trim();
}

export function buildPromptBundle(
  caseDefinition: CaseDefinition,
  strategy: ResolvedStrategyBundle,
): PromptBundle {
  const requirementBundle = caseDefinition.requirement_bundle;
  const additionalPromptDocs =
    strategy.kind === "business_fine_tuning"
      ? caseDefinition.additional_prompt_docs
          .map((path) => ({ path, text: readText(path).trim() }))
          .filter((item) => item.text)
      : [];
  const primaryRequirement = strategy.business_context.include_primary_requirement
    ? readText(requirementBundle.primary_requirement_doc).trim()
    : "";
  const supportingDocs = strategy.business_context.include_supporting_docs
    ? requirementBundle.supporting_docs
        .map((path) => ({ path, text: maybeReadText(path)?.trim() ?? "" }))
        .filter((item) => item.text)
    : [];
  const apiContracts = strategy.business_context.include_api_contracts
    ? requirementBundle.api_contracts
        .map((path) => ({ path, text: maybeReadText(path)?.trim() ?? "" }))
        .filter((item) => item.text)
    : [];
  const designNotes = strategy.business_context.include_design_notes
    ? requirementBundle.design_notes
        .map((path) => ({ path, text: maybeReadText(path)?.trim() ?? "" }))
        .filter((item) => item.text)
    : [];
  const screenshots = strategy.business_context.include_screenshots
    ? requirementBundle.screenshots
        .map((path) => ({ path, text: maybeReadText(path)?.trim() ?? "" }))
        .filter((item) => item.text)
    : [];
  const repoMap =
    strategy.business_context.repo_map.enabled && strategy.business_context.repo_map.source
      ? sliceIfNeeded(
          readText(strategy.business_context.repo_map.source),
          strategy.business_context.repo_map.max_chars ?? null,
        )
      : "";

  const strategySkills = strategy.skills.map((skillId) => buildExplicitSkill(skillId));
  const packageSkills = strategy.resolved_context_packages.map((item) => ({
    manifest: item,
    ...buildPackageSkill(item),
  }));
  const explicitSkills = strategy.kind === "business_fine_tuning"
    ? packageSkills.map((item) => item.skill)
    : strategySkills.map((item) => item.skill);

  const taskCard = buildTaskCard(caseDefinition, strategy);
  const evaluationContract = buildEvaluationContract(caseDefinition, strategy);
  const systemMessageSuffixTemplate = readText(strategy.prompt.system_message_suffix_template).trim();
  const systemTemplate = readText(strategy.prompt.system_template).trim();

  const systemMessageSuffixSections = [
    systemMessageSuffixTemplate
      ? renderXmlTag("EVALUATION_GUIDANCE", escapeXmlText(systemMessageSuffixTemplate))
      : "",
    additionalPromptDocs.length > 0
      ? renderDocumentTag("CASE_CONTEXT", additionalPromptDocs, "CASE_PROMPT_DOC")
      : "",
    Object.keys(taskCard).length > 0 ? renderTaskCard(taskCard) : "",
    repoMap ? renderXmlTag("REPO_MAP", escapeXmlText(repoMap)) : "",
    strategy.case_bindings.task_notes.length > 0
      ? renderListTag("TASK_NOTES", strategy.case_bindings.task_notes)
      : "",
    evaluationContract,
  ].filter(Boolean);

  const userSections = [
    renderXmlTag(
      "CASE",
      [
        renderXmlTag("ID", escapeXmlText(caseDefinition.id)),
        renderXmlTag("NAME", escapeXmlText(caseDefinition.name)),
        renderXmlTag("PROJECT", escapeXmlText(caseDefinition.project)),
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    primaryRequirement ? renderXmlTag("PRIMARY_REQUIREMENT", escapeXmlText(primaryRequirement)) : "",
    renderListTag("ACCEPTANCE_CRITERIA", requirementBundle.acceptance_criteria),
    renderDocumentTag("SUPPORTING_DOCS", supportingDocs),
    renderDocumentTag("API_CONTRACTS", apiContracts),
    renderDocumentTag("DESIGN_NOTES", designNotes),
    renderDocumentTag("SCREENSHOTS", screenshots),
  ].filter(Boolean);

  const loadedSkills =
    strategy.kind === "business_fine_tuning"
      ? unique(
          packageSkills
            .filter((item) => item.manifest.kind === "skill")
            .map((item) => item.skill.name),
        )
      : unique(strategySkills.map((item) => item.skill.name));
  const loadedSkillRecords =
    strategy.kind === "business_fine_tuning"
      ? packageSkills.map((item) => item.record)
      : strategySkills.map((item) => item.record);

  const systemMessageSuffix = systemMessageSuffixSections.join("\n\n").trim();
  const userMessage = userSections.join("\n\n").trim();
  const configuredPackages = strategy.context_packages;
  const loadedPackages = strategy.resolved_context_packages.map((item) => item.ref);
  const caseContext = {
    case_id: caseDefinition.id,
    case_name: caseDefinition.name,
    project: caseDefinition.project,
    primary_requirement_doc: requirementBundle.primary_requirement_doc,
    additional_prompt_docs: additionalPromptDocs.map((item) => item.path),
    supporting_docs: supportingDocs.map((item) => item.path),
    api_contracts: apiContracts.map((item) => item.path),
    design_notes: designNotes.map((item) => item.path),
    screenshots: screenshots.map((item) => item.path),
    scope: caseDefinition.scope,
    completion_checks: caseDefinition.completion_checks,
    expected_artifacts: caseDefinition.expected_artifacts,
    expected_keywords: caseDefinition.expected_keywords,
    expected_skills: caseDefinition.expected_skills,
    expected_tools: caseDefinition.expected_tools,
    task_notes: strategy.case_bindings.task_notes,
    task_card: taskCard,
    user_message: userMessage,
  };

  return {
    base_system_prompt: systemTemplate,
    system_message_suffix: systemMessageSuffix,
    user_message: userMessage,
    runtime_context: {
      base_system_prompt: systemTemplate,
      system_message_suffix: systemMessageSuffix,
      explicit_skills: explicitSkills,
      load_platform_context: true,
      load_workspace_context: strategy.business_context.load_workspace_context,
      condenser: {
        type:
          strategy.session_context.condenser.type === "none" ? "none" : "event_summary_v1",
        max_events: strategy.session_context.condenser.max_events,
        keep_first: strategy.session_context.condenser.keep_first,
        keep_recent: strategy.session_context.condenser.keep_recent,
      },
    },
    task_card: taskCard,
    case_context: caseContext,
    evaluation_contract: evaluationContract,
    loaded_skills: loadedSkills,
    loaded_skill_records: loadedSkillRecords,
    configured_packages: configuredPackages,
    loaded_packages: loadedPackages,
    resolved_strategy: strategy,
  };
}
