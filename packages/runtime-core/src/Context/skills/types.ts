export type SkillTrigger =
  | {
      type: "keyword";
      keywords: string[];
    }
  | null;

export type SkillResources = {
  skillRoot: string;
  scripts: string[];
  references: string[];
  assets: string[];
};

export type Skill = {
  name: string;
  content: string;
  source?: string | null;
  trigger?: SkillTrigger;
  description?: string | null;
  license?: string | null;
  compatibility?: string | null;
  metadata?: Record<string, string> | null;
  allowed_tools?: string[] | null;
  mcp_tools?: Record<string, unknown> | null;
  isAgentSkillsFormat?: boolean;
  resources?: SkillResources | null;
};
