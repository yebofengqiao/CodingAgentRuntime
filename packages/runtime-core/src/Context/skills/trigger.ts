import type { Skill } from "./types";

export function matchSkillTrigger(skill: Skill, query: string): string | null {
  if (!skill.trigger || skill.trigger.type !== "keyword") {
    return null;
  }
  const normalizedQuery = query.toLowerCase();
  for (const keyword of skill.trigger.keywords) {
    if (normalizedQuery.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  return null;
}
