import type { Skill } from "@openhands-rl/runtime-core/runtime";

import type {
  PackageObservation,
  PromptBundle,
  ResolvedContextPackage,
  SkillObservationPayload,
  SkillRecord,
  SkillSnapshot,
  SkillSourceKind,
} from "../schemas";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function isAlwaysOnRepoContextRecord(
  record: Pick<SkillRecord, "trigger" | "is_agent_skills_format">,
): boolean {
  return record.trigger == null && record.is_agent_skills_format !== true;
}

function inferAlwaysOnActivatedSkills(
  loadedSkills: string[],
  records: SkillRecord[],
): string[] {
  if (loadedSkills.length === 0 || records.length === 0) {
    return [];
  }
  const loaded = new Set(unique(loadedSkills));
  return unique(
    records
      .filter((record) => loaded.has(record.name))
      .filter((record) => isAlwaysOnRepoContextRecord(record))
      .map((record) => record.name),
  );
}

function normalizeSourceKind(value: unknown): SkillSourceKind | null {
  return value === "strategy_skill" || value === "context_package" ? value : null;
}

function normalizeStringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key, typeof item === "string" ? item : String(item ?? "")] as const)
    .filter(([, item]) => item.trim().length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized = unique(value.map((item) => String(item ?? "")));
  return normalized.length > 0 ? normalized : null;
}

function normalizeResources(value: unknown): SkillSnapshot["resources"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const skillRoot = typeof raw.skillRoot === "string" ? raw.skillRoot.trim() : "";
  if (!skillRoot) {
    return null;
  }
  return {
    skillRoot,
    scripts: normalizeStringArray(raw.scripts) ?? [],
    references: normalizeStringArray(raw.references) ?? [],
    assets: normalizeStringArray(raw.assets) ?? [],
  };
}

function normalizeTrigger(value: unknown): SkillSnapshot["trigger"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.type !== "keyword") {
    return null;
  }
  const keywords = normalizeStringArray(raw.keywords) ?? [];
  return keywords.length > 0
    ? {
        type: "keyword",
        keywords,
      }
    : null;
}

function normalizeSkillSnapshot(value: unknown): SkillSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) {
    return null;
  }
  const source = typeof raw.source === "string" ? raw.source.trim() : "";
  const description = typeof raw.description === "string" ? raw.description : null;
  const license = typeof raw.license === "string" ? raw.license : null;
  const compatibility = typeof raw.compatibility === "string" ? raw.compatibility : null;
  return {
    name,
    source: source || null,
    trigger: normalizeTrigger(raw.trigger),
    description,
    license,
    compatibility,
    metadata: normalizeStringRecord(raw.metadata),
    allowed_tools: normalizeStringArray(raw.allowed_tools),
    mcp_tools:
      raw.mcp_tools && typeof raw.mcp_tools === "object" && !Array.isArray(raw.mcp_tools)
        ? (raw.mcp_tools as Record<string, unknown>)
        : null,
    is_agent_skills_format: raw.is_agent_skills_format === true,
    resources: normalizeResources(raw.resources),
  };
}

export function snapshotSkill(skill: Skill): SkillSnapshot {
  return {
    name: skill.name,
    source: typeof skill.source === "string" && skill.source.trim() ? skill.source : null,
    trigger: skill.trigger ?? null,
    description: skill.description ?? null,
    license: skill.license ?? null,
    compatibility: skill.compatibility ?? null,
    metadata: skill.metadata ?? null,
    allowed_tools: skill.allowed_tools ?? null,
    mcp_tools: skill.mcp_tools ?? null,
    is_agent_skills_format: skill.isAgentSkillsFormat ?? false,
    resources: skill.resources ?? null,
  };
}

function buildSkillRecord(
  skill: Skill,
  input: {
    sourceKind: SkillSourceKind;
    sourceRef?: string | null;
    packageKind?: ResolvedContextPackage["kind"] | null;
  },
): SkillRecord {
  return {
    ...snapshotSkill(skill),
    source_kind: input.sourceKind,
    source_ref: input.sourceRef ?? null,
    source_path:
      typeof skill.source === "string" && skill.source.trim()
        ? skill.source
        : null,
    package_kind: input.packageKind ?? null,
  };
}

export function buildStrategySkillRecord(skill: Skill, skillId: string): SkillRecord {
  return buildSkillRecord(skill, {
    sourceKind: "strategy_skill",
    sourceRef: skillId,
  });
}

export function buildPackageSkillRecord(
  item: ResolvedContextPackage,
  skill: Skill,
): SkillRecord {
  return buildSkillRecord(skill, {
    sourceKind: "context_package",
    sourceRef: item.ref,
    packageKind: item.kind,
  });
}

function skillRecordKey(record: SkillRecord): string {
  return JSON.stringify([
    record.source_kind,
    record.source_ref,
    record.package_kind,
    record.name,
    record.source_path,
  ]);
}

export function dedupeSkillRecords(records: SkillRecord[]): SkillRecord[] {
  const seen = new Set<string>();
  return records
    .filter((record) => record.name.trim().length > 0)
    .filter((record) => {
      const key = skillRecordKey(record);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => skillRecordKey(left).localeCompare(skillRecordKey(right)));
}

export function partitionSkillRecords(records: SkillRecord[]): {
  strategy_skill_records: SkillRecord[];
  package_skill_records: SkillRecord[];
} {
  return {
    strategy_skill_records: dedupeSkillRecords(
      records.filter((record) => record.source_kind === "strategy_skill"),
    ),
    package_skill_records: dedupeSkillRecords(
      records.filter((record) => record.source_kind === "context_package"),
    ),
  };
}

export function buildSkillObservations(
  promptBundle: PromptBundle,
  executorResult: {
    skill_events: Array<{ skill: string }>;
    package_observations: PackageObservation[];
  },
): SkillObservationPayload {
  const configuredSkillPackages = unique(
    promptBundle.configured_packages.filter((ref) => ref.startsWith("skill/")),
  );
  const loadedSkillPackages = unique(
    promptBundle.loaded_packages.filter((ref) => ref.startsWith("skill/")),
  );
  const activatedSkillPackages = unique(
    executorResult.package_observations
      .filter((item) => item.ref.startsWith("skill/") && item.activated === true)
      .map((item) => item.ref),
  );
  const loadedSkills = unique(promptBundle.loaded_skills);
  const inferredAlwaysOnSkills = inferAlwaysOnActivatedSkills(
    loadedSkills,
    promptBundle.loaded_skill_records,
  );
  const activatedSkills = unique([
    ...executorResult.skill_events.map((item) => item.skill),
    ...inferredAlwaysOnSkills,
  ]);
  const partitioned = partitionSkillRecords(promptBundle.loaded_skill_records);

  return {
    loaded_skills: loadedSkills,
    activated_skills: activatedSkills,
    configured_skill_packages: configuredSkillPackages,
    loaded_skill_packages: loadedSkillPackages,
    activated_skill_packages: activatedSkillPackages,
    observed_skill_hits: unique([...activatedSkills, ...activatedSkillPackages]),
    strategy_skill_records: partitioned.strategy_skill_records,
    package_skill_records: partitioned.package_skill_records,
  };
}

function normalizeSkillRecordArray(value: unknown): SkillRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return dedupeSkillRecords(
    value
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return null;
        }
        const raw = item as Record<string, unknown>;
        const snapshot = normalizeSkillSnapshot(raw);
        const sourceKind = normalizeSourceKind(raw.source_kind);
        if (!snapshot || !sourceKind) {
          return null;
        }
        return {
          ...snapshot,
          source_kind: sourceKind,
          source_ref: typeof raw.source_ref === "string" ? raw.source_ref : null,
          source_path: typeof raw.source_path === "string" ? raw.source_path : null,
          package_kind:
            raw.package_kind === "repo-policy" || raw.package_kind === "skill"
              ? raw.package_kind
              : null,
        } satisfies SkillRecord;
      })
      .filter((item): item is SkillRecord => item != null),
  );
}

export function readSkillObservations(
  resultPayload: Record<string, unknown>,
): SkillObservationPayload {
  const explicit = (resultPayload.skill_observations ?? {}) as Record<string, unknown>;
  const packageObservations = Array.isArray(resultPayload.package_observations)
    ? (resultPayload.package_observations as Array<Record<string, unknown>>)
    : [];

  const loadedSkills = unique(
    Array.isArray(explicit.loaded_skills)
      ? explicit.loaded_skills.map((item) => String(item ?? ""))
      : [],
  );
  const configuredSkillPackages = unique(
    Array.isArray(explicit.configured_skill_packages)
      ? explicit.configured_skill_packages.map((item) => String(item ?? ""))
      : normalizeLegacyPackageRefs(resultPayload.configured_packages),
  );
  const loadedSkillPackages = unique(
    Array.isArray(explicit.loaded_skill_packages)
      ? explicit.loaded_skill_packages.map((item) => String(item ?? ""))
      : normalizeLegacyPackageRefs(resultPayload.loaded_packages),
  );
  const activatedSkillPackages = unique(
    Array.isArray(explicit.activated_skill_packages)
      ? explicit.activated_skill_packages.map((item) => String(item ?? ""))
      : packageObservations
          .filter((item) => String(item.ref ?? "").startsWith("skill/") && item.activated === true)
          .map((item) => String(item.ref ?? "")),
  );
  const activatedSkills = unique(
    Array.isArray(explicit.activated_skills)
      ? explicit.activated_skills.map((item) => String(item ?? ""))
      : [],
  );
  const strategySkillRecords = normalizeSkillRecordArray(explicit.strategy_skill_records);
  const packageSkillRecords = normalizeSkillRecordArray(explicit.package_skill_records);
  const inferredAlwaysOnSkills = inferAlwaysOnActivatedSkills(
    loadedSkills,
    [...strategySkillRecords, ...packageSkillRecords],
  );
  const normalizedActivatedSkills = unique([...activatedSkills, ...inferredAlwaysOnSkills]);

  return {
    loaded_skills: loadedSkills,
    activated_skills: normalizedActivatedSkills,
    configured_skill_packages: configuredSkillPackages,
    loaded_skill_packages: loadedSkillPackages,
    activated_skill_packages: activatedSkillPackages,
    observed_skill_hits:
      Array.isArray(explicit.observed_skill_hits) && explicit.observed_skill_hits.length > 0
        ? unique(explicit.observed_skill_hits.map((item) => String(item ?? "")))
        : unique([...normalizedActivatedSkills, ...activatedSkillPackages]),
    strategy_skill_records: strategySkillRecords,
    package_skill_records: packageSkillRecords,
  };
}

function normalizeLegacyPackageRefs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? ""))
    .filter((ref) => ref.startsWith("skill/"));
}
