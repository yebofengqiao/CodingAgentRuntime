import { relative, resolve } from "node:path";

import {
  get_message_role,
  type Event,
  type Skill,
} from "@openhands-rl/runtime-core/runtime";

import type {
  PackageObservation,
  PromptBundle,
  SkillEvent,
  SkillRecord,
} from "../schemas";

const CONTENT_READ_COMMANDS = new Set(["cat", "grep", "head", "rg", "sed", "tail"]);
const SCRIPT_EXEC_COMMANDS = new Set(["bash", "bun", "node", "python", "python3", "sh", "tsx"]);

function normalizeCandidatePath(pathValue: string, workspacePath: string): string[] {
  const absolutePath = pathValue.startsWith("/") ? resolve(pathValue) : resolve(workspacePath, pathValue);
  const candidates = [absolutePath];
  const relativePath = relative(workspacePath, absolutePath);
  if (relativePath && !relativePath.startsWith("..")) {
    candidates.push(relativePath);
  }
  return Array.from(new Set(candidates));
}

function collectSkillActivationPaths(skill: Skill, workspacePath: string): string[] {
  const paths = new Set<string>();
  if (typeof skill.source === "string" && skill.source.trim()) {
    for (const candidate of normalizeCandidatePath(skill.source, workspacePath)) {
      paths.add(candidate);
    }
  }
  const resources = skill.resources;
  if (resources?.skillRoot) {
    for (const group of [resources.references ?? [], resources.assets ?? [], resources.scripts ?? []]) {
      for (const resourcePath of group) {
        for (const candidate of normalizeCandidatePath(
          resolve(resources.skillRoot, resourcePath),
          workspacePath,
        )) {
          paths.add(candidate);
        }
      }
    }
  }
  return [...paths];
}

function extractActionArguments(event: Event): Record<string, unknown> {
  return event.payload.arguments && typeof event.payload.arguments === "object"
    ? (event.payload.arguments as Record<string, unknown>)
    : {};
}

function extractPrimaryCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) {
    return "";
  }
  const tokenMatch = trimmed.match(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*([^\s]+)/);
  const token = tokenMatch?.[1] ?? "";
  return token.split("/").pop()?.toLowerCase() ?? "";
}

function commandMayActivateSkill(command: string): boolean {
  const primary = extractPrimaryCommand(command);
  return CONTENT_READ_COMMANDS.has(primary) || SCRIPT_EXEC_COMMANDS.has(primary);
}

function commandMatchesAnySkillPath(command: string, candidates: string[]): boolean {
  return candidates.some((candidate) => candidate && command.includes(candidate));
}

function detectTracePathActivation(
  skill: Skill,
  events: Event[],
  workspacePath: string,
): number | null {
  const candidates = collectSkillActivationPaths(skill, workspacePath);
  if (candidates.length === 0) {
    return null;
  }

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.kind !== "action" || typeof event.payload.tool_name !== "string") {
      continue;
    }
    const arguments_ = extractActionArguments(event);

    if (event.payload.tool_name === "file_editor") {
      const command = typeof arguments_.command === "string" ? arguments_.command.trim() : "";
      const pathValue = typeof arguments_.path === "string" ? arguments_.path.trim() : "";
      if (command !== "view" || !pathValue) {
        continue;
      }
      const resolvedPath = normalizeCandidatePath(pathValue, workspacePath)[0];
      if (candidates.includes(resolvedPath)) {
        return index + 1;
      }
      continue;
    }

    if (event.payload.tool_name === "terminal") {
      const command = typeof arguments_.command === "string" ? arguments_.command.trim() : "";
      if (!command || !commandMayActivateSkill(command)) {
        continue;
      }
      if (commandMatchesAnySkillPath(command, candidates)) {
        return index + 1;
      }
    }
  }

  return null;
}

function detectPromptTriggeredActivation(skillName: string, events: Event[]): number | null {
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.kind !== "message" || get_message_role(event.payload) !== "user") {
      continue;
    }
    const activatedSkills = Array.isArray(event.payload.activated_skills)
      ? event.payload.activated_skills.filter((item): item is string => typeof item === "string")
      : [];
    if (activatedSkills.includes(skillName)) {
      return index + 1;
    }
  }
  return null;
}

function isAlwaysOnRepoContextSkill(skill: Skill): boolean {
  return skill.trigger == null && skill.isAgentSkillsFormat !== true;
}

function earliestSkillEvent(events: SkillEvent[]): SkillEvent | null {
  if (events.length === 0) {
    return null;
  }
  return [...events].sort((left, right) => left.activated_at_step - right.activated_at_step)[0] ?? null;
}

function groupPackageSkillRecords(records: SkillRecord[]): Map<string, SkillRecord[]> {
  const grouped = new Map<string, SkillRecord[]>();
  for (const record of records) {
    if (record.source_kind !== "context_package" || !record.source_ref) {
      continue;
    }
    const current = grouped.get(record.source_ref) ?? [];
    current.push(record);
    grouped.set(record.source_ref, current);
  }
  return grouped;
}

export function buildActivatedSkillEvents(
  promptBundle: PromptBundle,
  events: Event[],
  workspacePath: string,
): SkillEvent[] {
  const explicitSkills = Array.isArray(promptBundle.runtime_context.explicit_skills)
    ? promptBundle.runtime_context.explicit_skills
    : [];
  const loadedSkillNames = new Set(promptBundle.loaded_skills);
  const activations: SkillEvent[] = [];

  for (const skill of explicitSkills) {
    if (!skill.name || !loadedSkillNames.has(skill.name)) {
      continue;
    }

    if (isAlwaysOnRepoContextSkill(skill)) {
      activations.push({
        skill: skill.name,
        mode: "always_on",
        activated_at_step: 0,
      });
      continue;
    }

    const promptTriggeredAtStep = detectPromptTriggeredActivation(skill.name, events);
    if (promptTriggeredAtStep != null) {
      activations.push({
        skill: skill.name,
        mode: "prompt_trigger",
        activated_at_step: promptTriggeredAtStep,
      });
      continue;
    }

    const traceActivatedAtStep = detectTracePathActivation(skill, events, workspacePath);
    if (traceActivatedAtStep != null) {
      activations.push({
        skill: skill.name,
        mode: "trace_path",
        activated_at_step: traceActivatedAtStep,
      });
    }
  }

  return activations;
}

export function buildPackageObservations(
  promptBundle: PromptBundle,
  skillEvents: SkillEvent[],
): PackageObservation[] {
  const loadedPackages = new Set(promptBundle.loaded_packages);
  const packageSkillRecords = groupPackageSkillRecords(promptBundle.loaded_skill_records);
  const skillEventMap = new Map<string, SkillEvent[]>();

  for (const event of skillEvents) {
    const current = skillEventMap.get(event.skill) ?? [];
    current.push(event);
    skillEventMap.set(event.skill, current);
  }

  return promptBundle.configured_packages.map((ref) => {
    const loaded = loadedPackages.has(ref);
    const records = packageSkillRecords.get(ref) ?? [];
    const alwaysOn = records.some(
      (record) => record.trigger == null && record.is_agent_skills_format !== true,
    );
    const matchedEvent = earliestSkillEvent(
      records.flatMap((record) => skillEventMap.get(record.name) ?? []),
    );

    if (!loaded) {
      return {
        ref,
        configured: true,
        loaded: false,
        read: null,
        activated: null,
        activation_source: null,
      };
    }

    if (alwaysOn) {
      return {
        ref,
        configured: true,
        loaded: true,
        read: true,
        activated: true,
        activation_source: "always_on",
      };
    }

    if (matchedEvent) {
      return {
        ref,
        configured: true,
        loaded: true,
        read: true,
        activated: true,
        activation_source: matchedEvent.mode,
      };
    }

    return {
      ref,
      configured: true,
      loaded: true,
      read: false,
      activated: false,
      activation_source: null,
    };
  });
}
