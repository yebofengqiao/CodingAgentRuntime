import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  create_event,
  createTextContentBlock,
  textContentBlocksToText,
  type Event,
  type LlmMessagePayload,
  type MessageEvent,
  type SystemPromptEvent,
  type TextContentBlock,
} from "../Event/event";
import type { ToolDefinition } from "../Tool/tool";
import { load_project_skills, load_user_skills, matchSkillTrigger, type Skill } from "./skills";

export {
  load_project_skills,
  load_skill_from_path,
  load_skills_from_dir,
  load_user_skills,
} from "./skills";
export type { Skill, SkillResources, SkillTrigger } from "./skills";

const TEMPLATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "templates");
const DEFAULT_BASE_SYSTEM_PROMPT_TEXT = readFileSync(
  resolve(TEMPLATE_DIR, "system_prompt.j2"),
  "utf-8",
).trim();

export type CondenserType = "none" | "event_summary_v1";

export type CondenserConfig = {
  type: CondenserType;
  max_events: number;
  keep_first: number;
  keep_recent: number;
};

export type RuntimeContextConfig = {
  context_root?: string | null;
  platform_context_root?: string | null;
  workspace_context_root?: string | null;
  base_system_prompt?: string | null;
  system_message_suffix?: string | null;
  user_message_suffix?: string | null;
  current_datetime?: string | Date | null;
  explicit_skills?: Skill[];
  condenser?: Partial<CondenserConfig> | null;
  load_project_skills?: boolean;
  load_user_skills?: boolean;
  load_platform_context?: boolean;
  load_workspace_context?: boolean;
};

export type ResolvedRuntimeContext = {
  context_root: string;
  platform_context_root: string | null;
  workspace_context_root: string;
  base_system_prompt: string;
  system_message_suffix: string;
  user_message_suffix: string;
  current_datetime: string | null;
  skills: Skill[];
  condenser: CondenserConfig;
  agent_context: AgentContext;
};

export type UserMessageAugmentation = {
  text: string;
  activated_skills: string[];
  extended_content: TextContentBlock[];
};

export type AgentContextConfig = {
  skills?: Skill[];
  system_message_suffix?: string | null;
  user_message_suffix?: string | null;
  current_datetime?: string | Date | null;
};

export type AgentContextRenderOptions = {
  working_dir?: string;
  context_root?: string;
  workspace_context_root?: string;
  platform_context_root?: string | null;
  llm_model?: string | null;
  llm_model_canonical?: string | null;
};

export function merge_activated_knowledge_skills(
  current: string[],
  next: string[],
): string[] {
  const merged = new Set<string>();
  for (const value of current) {
    if (typeof value === "string" && value.trim()) {
      merged.add(value.trim());
    }
  }
  for (const value of next) {
    if (typeof value === "string" && value.trim()) {
      merged.add(value.trim());
    }
  }
  return [...merged];
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDatetime(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const text = trimString(value);
  return text || null;
}

function normalizeRoot(value: unknown): string | null {
  const text = trimString(value);
  return text ? resolve(text) : null;
}

function inferDescription(content: string): string | null {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));
  if (lines.length === 0) {
    return null;
  }
  return lines[0];
}

function mergeSkills(skills: Skill[]): Skill[] {
  const merged = new Map<string, Skill>();
  for (const skill of skills) {
    if (!skill.name) {
      continue;
    }
    merged.set(skill.name, skill);
  }
  return [...merged.values()];
}

function truncate(text: string, limit = 240): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(limit - 3, 0))}...`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function readTemplate(name: string): string {
  return readFileSync(resolve(TEMPLATE_DIR, name), "utf-8");
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    return values[key] ?? "";
  });
}

function renderAvailableSkills(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }

  const lines = ["<available_skills>"];
  for (const skill of skills) {
    const description =
      trimString(skill.description) || inferDescription(skill.content) || "No description provided.";
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(truncate(description))}</description>`);
    if (skill.source) {
      lines.push(`    <location>${escapeXml(skill.source)}</location>`);
    }
    lines.push("  </skill>");
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}

function renderRepoSkills(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }

  const lines = [
    "<REPO_CONTEXT>",
    "The following repository guidance is active for this run.",
    "",
  ];
  for (const skill of skills) {
    lines.push(`[BEGIN context from ${skill.name}]`);
    lines.push(skill.content);
    lines.push("[END context]");
  }
  lines.push("</REPO_CONTEXT>");
  return lines.join("\n");
}

function render_workspace_context(
  working_dir: string,
  workspace_context_root: string,
  platform_context_root: string | null,
): string {
  return [
    "<WORKSPACE>",
    `Working directory: ${working_dir}`,
    `Workspace context root: ${workspace_context_root}`,
    ...(platform_context_root ? [`Platform context root: ${platform_context_root}`] : []),
    "</WORKSPACE>",
  ].join("\n");
}

function categorizeSkills(skills: Skill[]): {
  repoSkills: Skill[];
  availableSkills: Skill[];
} {
  const repoSkills: Skill[] = [];
  const availableSkills: Skill[] = [];
  for (const skill of skills) {
    if (skill.isAgentSkillsFormat || skill.trigger) {
      availableSkills.push(skill);
      continue;
    }
    repoSkills.push(skill);
  }
  return {
    repoSkills,
    availableSkills,
  };
}

function render_current_datetime_section(current_datetime: string | null): string {
  if (!current_datetime) {
    return "";
  }
  return [
    "<CURRENT_DATETIME>",
    `The current date and time is: ${current_datetime}`,
    "</CURRENT_DATETIME>",
  ].join("\n");
}

function resolve_working_dir(options?: AgentContextRenderOptions): string {
  const preferred =
    options?.working_dir ??
    options?.workspace_context_root ??
    options?.context_root ??
    process.cwd();
  return resolve(preferred);
}

function resolve_workspace_context_root(
  working_dir: string,
  options?: AgentContextRenderOptions,
): string {
  return resolve(options?.workspace_context_root ?? options?.context_root ?? working_dir);
}

function resolve_platform_context_root(options?: AgentContextRenderOptions): string | null {
  return normalizeRoot(options?.platform_context_root);
}

function extractUserMessageText(userMessage: unknown): string {
  if (typeof userMessage === "string") {
    return userMessage.trim();
  }
  if (!userMessage || typeof userMessage !== "object") {
    return "";
  }

  const record = userMessage as Record<string, unknown>;
  if (record.llm_message && typeof record.llm_message === "object") {
    return extractUserMessageText(record.llm_message);
  }
  if (Array.isArray(record.content)) {
    return textContentBlocksToText(
      record.content.map((item) =>
        typeof item === "string"
          ? createTextContentBlock(item)
          : createTextContentBlock(String((item as { text?: unknown }).text ?? "")),
      ),
    ).trim();
  }
  if (typeof record.text === "string") {
    return record.text.trim();
  }
  return "";
}

export class AgentContext {
  readonly skills: Skill[];
  readonly system_message_suffix: string | null;
  readonly user_message_suffix: string | null;
  readonly current_datetime: string | null;

  constructor(config: AgentContextConfig = {}) {
    this.skills = mergeSkills(Array.isArray(config.skills) ? config.skills : []);
    this.system_message_suffix = trimString(config.system_message_suffix) || null;
    this.user_message_suffix = trimString(config.user_message_suffix) || null;
    this.current_datetime = normalizeDatetime(config.current_datetime);
  }

  get_system_message_suffix(options: AgentContextRenderOptions = {}): string | null {
    const working_dir = resolve_working_dir(options);
    const workspace_context_root = resolve_workspace_context_root(working_dir, options);
    const platform_context_root = resolve_platform_context_root(options);
    const { repoSkills, availableSkills } = categorizeSkills(this.skills);
    const rendered = renderTemplate(readTemplate("system_message_suffix.j2"), {
      current_datetime_section: render_current_datetime_section(this.current_datetime),
      workspace_section: render_workspace_context(
        working_dir,
        workspace_context_root,
        platform_context_root,
      ),
      repo_context_section: renderRepoSkills(repoSkills),
      skills_section:
        availableSkills.length > 0
          ? [
              "<SKILLS>",
              "The following skills are available and may be triggered by keywords or task types in your messages.",
              "When a skill is triggered, you will receive additional context and instructions.",
              "You can also directly inspect a skill's source path and use it proactively when relevant.",
              "",
              renderAvailableSkills(availableSkills),
              "</SKILLS>",
            ].join("\n")
          : "",
      system_message_suffix: this.system_message_suffix ?? "",
    });

    const normalized = rendered
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return normalized || null;
  }

  get_user_message_suffix(
    userMessage: unknown,
    skip_skill_names: string[] = [],
  ): UserMessageAugmentation | null {
    const query = extractUserMessageText(userMessage);
    const recalled: TextContentBlock[] = [];
    const activated_skills: string[] = [];
    const skipped = new Set(skip_skill_names);

    if (query) {
      for (const skill of this.skills) {
        const trigger = matchSkillTrigger(skill, query);
        if (!trigger || skipped.has(skill.name)) {
          continue;
        }
        activated_skills.push(skill.name);
        recalled.push(
          createTextContentBlock(
            renderTemplate(readTemplate("skill_knowledge_info.j2"), {
              trigger,
              location_block: skill.source
                ? `Skill location: ${skill.source}\n(Use this path to resolve relative file references in the skill content below)`
                : "",
              content: skill.content,
            }).trim(),
          ),
        );
        skipped.add(skill.name);
      }
    }

    if (this.user_message_suffix) {
      recalled.push(createTextContentBlock(this.user_message_suffix));
    }

    if (recalled.length === 0) {
      return null;
    }

    return {
      text: textContentBlocksToText(recalled),
      activated_skills,
      extended_content: recalled,
    };
  }
}

export function default_base_system_prompt(): string {
  return DEFAULT_BASE_SYSTEM_PROMPT_TEXT;
}

export function resolve_condenser_config(
  input?: Partial<CondenserConfig> | null,
): CondenserConfig {
  const type = input?.type === "none" ? "none" : "event_summary_v1";
  return {
    type,
    max_events:
      typeof input?.max_events === "number" && input.max_events > 0
        ? Math.floor(input.max_events)
        : 60,
    keep_first:
      typeof input?.keep_first === "number" && input.keep_first >= 0
        ? Math.floor(input.keep_first)
        : 2,
    keep_recent:
      typeof input?.keep_recent === "number" && input.keep_recent >= 0
        ? Math.floor(input.keep_recent)
        : 24,
  };
}

function load_context_skills(
  context_root: string | null,
  enabled: boolean,
): Skill[] {
  if (!enabled || !context_root) {
    return [];
  }
  return load_project_skills(context_root);
}

export function resolve_runtime_context(
  config: RuntimeContextConfig | undefined,
  working_dir: string,
): ResolvedRuntimeContext {
  const workspace_context_root = resolve(
    config?.workspace_context_root ?? config?.context_root ?? working_dir,
  );
  const platform_context_root = normalizeRoot(config?.platform_context_root);
  const shouldLoadProjectSkills = config?.load_project_skills !== false;
  const shouldLoadUserSkills = config?.load_user_skills === true;
  const load_platform_context =
    shouldLoadProjectSkills && config?.load_platform_context !== false;
  const load_workspace_context =
    shouldLoadProjectSkills && config?.load_workspace_context !== false;
  const user_skills = shouldLoadUserSkills ? load_user_skills() : [];
  const platform_skills = load_context_skills(platform_context_root, load_platform_context);
  const workspace_skills = load_context_skills(
    workspace_context_root,
    load_workspace_context,
  );
  const explicit_skills = Array.isArray(config?.explicit_skills) ? config.explicit_skills : [];
  const skills = mergeSkills([
    ...user_skills,
    ...platform_skills,
    ...workspace_skills,
    ...explicit_skills,
  ]);
  const system_message_suffix = trimString(config?.system_message_suffix);
  const user_message_suffix = trimString(config?.user_message_suffix);
  const current_datetime = normalizeDatetime(config?.current_datetime);
  const agent_context = new AgentContext({
    skills,
    system_message_suffix,
    user_message_suffix,
    current_datetime,
  });

  return {
    context_root: workspace_context_root,
    platform_context_root,
    workspace_context_root,
    base_system_prompt: trimString(config?.base_system_prompt) || default_base_system_prompt(),
    system_message_suffix,
    user_message_suffix,
    current_datetime,
    skills,
    condenser: resolve_condenser_config(config?.condenser),
    agent_context,
  };
}

export function recover_activated_knowledge_skills(events: Event[]): string[] {
  const activated = new Set<string>();
  for (const event of events) {
    if (event.kind !== "message" || event.source !== "user") {
      continue;
    }
    const skillNames = Array.isArray(event.payload.activated_skills)
      ? event.payload.activated_skills
      : [];
    for (const item of skillNames) {
      if (typeof item === "string" && item.trim()) {
        activated.add(item.trim());
      }
    }
  }
  return [...activated];
}

export function render_system_message_suffix(
  runtime_context: ResolvedRuntimeContext,
  working_dir: string,
): string {
  return (
    runtime_context.agent_context.get_system_message_suffix({
      working_dir,
      context_root: runtime_context.context_root,
      workspace_context_root: runtime_context.workspace_context_root,
      platform_context_root: runtime_context.platform_context_root,
    }) ?? ""
  );
}

export function render_system_prompt(
  runtime_context: ResolvedRuntimeContext,
  working_dir: string,
): string {
  const parts = [
    runtime_context.base_system_prompt.trim(),
    render_system_message_suffix(runtime_context, working_dir),
  ].filter(Boolean);
  return parts.join("\n\n").trim();
}

export function build_system_prompt_event(input?: {
  runtime_context?: ResolvedRuntimeContext;
  working_dir?: string;
  tools?: ToolDefinition[];
}): SystemPromptEvent {
  const runtime_context =
    input?.runtime_context ?? resolve_runtime_context(undefined, input?.working_dir ?? process.cwd());
  const working_dir = resolve(input?.working_dir ?? runtime_context.workspace_context_root);
  const dynamic_context = render_system_message_suffix(runtime_context, working_dir);
  const system_prompt = createTextContentBlock(runtime_context.base_system_prompt);
  const dynamic_context_block = dynamic_context ? createTextContentBlock(dynamic_context) : null;

  return create_event("system_prompt", "agent", {
    system_prompt,
    dynamic_context: dynamic_context_block,
    tools: input?.tools ?? [],
    context_root: runtime_context.context_root,
    platform_context_root: runtime_context.platform_context_root,
    workspace_context_root: runtime_context.workspace_context_root,
    working_dir,
  });
}

export function build_user_message_augmentation(
  raw_text: string,
  skip_skill_names: string[],
  runtime_context: ResolvedRuntimeContext,
): UserMessageAugmentation | null {
  return runtime_context.agent_context.get_user_message_suffix(
    {
      role: "user",
      content: [createTextContentBlock(raw_text.trim())],
    },
    skip_skill_names,
  );
}

export function build_user_message_event(input: {
  raw_text: string;
  prior_events: Event[];
  runtime_context: ResolvedRuntimeContext;
  skip_skill_names?: string[];
}): MessageEvent {
  const trimmed = input.raw_text.trim();
  const skip_skill_names =
    input.skip_skill_names ?? recover_activated_knowledge_skills(input.prior_events);
  const augmentation = build_user_message_augmentation(
    trimmed,
    skip_skill_names,
    input.runtime_context,
  );
  const llmMessage: LlmMessagePayload = {
    role: "user",
    content: [createTextContentBlock(trimmed)],
  };
  return create_event("message", "user", {
    llm_message: llmMessage,
    activated_skills: augmentation?.activated_skills ?? [],
    extended_content: augmentation?.extended_content ?? [],
  });
}

export function render_ask_agent_template(question: string): string {
  return renderTemplate(readTemplate("ask_agent_template.j2"), {
    question: question.trim(),
  }).trim();
}
