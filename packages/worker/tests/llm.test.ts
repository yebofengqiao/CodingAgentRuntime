import { describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  settings: {
    llmApiKey: "key-123",
    llmModel: "model-default",
    llmBaseUrl: "http://llm.example.com/v1",
  },
}));

vi.mock("@openhands-rl/backend-core/config", () => config);

describe("llmConfigFromSettings", () => {
  it("uses configured defaults", async () => {
    const { llmConfigFromSettings } = await import("../src/shared/llm");

    expect(llmConfigFromSettings()).toEqual({
      apiKey: "key-123",
      model: "model-default",
      baseUrl: "http://llm.example.com/v1",
    });
  });

  it("allows overriding the model", async () => {
    const { llmConfigFromSettings } = await import("../src/shared/llm");

    expect(llmConfigFromSettings("override-model")).toMatchObject({
      model: "override-model",
    });
  });
});
