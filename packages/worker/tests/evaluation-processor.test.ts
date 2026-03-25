import { describe, expect, it, vi } from "vitest";

const orchestrator = vi.hoisted(() => ({
  processEvaluationRun: vi.fn(),
}));

vi.mock("@openhands-rl/backend-core/evaluation/services/run-orchestrator", () => orchestrator);

describe("processEvaluationRunJob", () => {
  it("delegates to the evaluation orchestrator", async () => {
    const { processEvaluationRunJob } = await import("../src/jobs/evaluation/processor");

    await processEvaluationRunJob("run-123");

    expect(orchestrator.processEvaluationRun).toHaveBeenCalledWith("run-123");
  });
});
