import { describe, expect, it } from "vitest";

import {
  formatChangedAxis,
  formatContextMode,
  formatFailureBucketLabel,
  formatGapBucketLabel,
  formatMode,
  formatRootCauseLabel,
  formatSkillSource,
  formatTuningAxis,
} from "../src/shared/lib/format";
import { getTerm } from "../src/shared/lib/terms";

describe("evaluation frontend terminology", () => {
  it("formats core runtime enums with canonical terms", () => {
    expect(formatMode("business_fine_tuning")).toBe("Business FT");
    expect(formatChangedAxis("skills")).toBe("Skills");
    expect(formatTuningAxis("session_context")).toBe("Session Context");
    expect(formatContextMode("structured_task_card")).toBe("Task Card");
    expect(formatSkillSource("strategy_skill")).toBe("Strategy Skill");
  });

  it("formats diagnosis enums without leaking machine values", () => {
    expect(formatFailureBucketLabel("task_misunderstanding")).toBe("Task Misunderstanding");
    expect(formatGapBucketLabel("skills_gap")).toBe("Skills Gap");
    expect(formatRootCauseLabel("package_loaded_but_not_read")).toBe("Package Not Read");
  });

  it("provides tooltip descriptions for key UI terms", () => {
    expect(getTerm("section.run_matrix").description).toContain("Case");
    expect(getTerm("field.loaded").description).toContain("运行时");
    expect(getTerm("artifact.runtime_context").label).toBe("Runtime Context");
  });
});
