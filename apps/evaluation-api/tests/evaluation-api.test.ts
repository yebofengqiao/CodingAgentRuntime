import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const catalogServiceMocks = vi.hoisted(() => ({
  listCasesService: vi.fn().mockResolvedValue([]),
  listVariantsService: vi.fn().mockResolvedValue([]),
}));

const experimentServiceMocks = vi.hoisted(() => ({
  listExperimentsService: vi.fn(),
  createExperimentService: vi.fn(),
  getExperimentService: vi.fn(),
  startExperimentService: vi.fn(),
}));

const runServiceMocks = vi.hoisted(() => ({
  getRunService: vi.fn(),
  startRunService: vi.fn(),
  rerunRunService: vi.fn(),
  cancelRunService: vi.fn(),
  getRunTraceService: vi.fn(),
}));

const artifactServiceMocks = vi.hoisted(() => ({
  getArtifactPathService: vi.fn(),
}));

const reportServiceMocks = vi.hoisted(() => ({
  getExperimentReportPathService: vi.fn(),
}));

const fileMocks = vi.hoisted(() => ({
  loadBinaryFile: vi.fn(),
}));

vi.mock("../src/modules/catalog/service", () => catalogServiceMocks);
vi.mock("../src/modules/experiments/service", () => experimentServiceMocks);
vi.mock("../src/modules/runs/service", () => runServiceMocks);
vi.mock("../src/modules/artifacts/service", () => artifactServiceMocks);
vi.mock("../src/modules/reports/service", () => reportServiceMocks);
vi.mock("../src/shared/http/files", () => fileMocks);

describe("evaluation-api", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEvaluationFrontendUrl = process.env.EVALUATION_FRONTEND_URL;
  const originalViteEvaluationFrontendUrl = process.env.VITE_EVALUATION_FRONTEND_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    process.env.EVALUATION_FRONTEND_URL = "http://127.0.0.1:3001";
    delete process.env.VITE_EVALUATION_FRONTEND_URL;
  });

  afterEach(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalEvaluationFrontendUrl === undefined) {
      delete process.env.EVALUATION_FRONTEND_URL;
    } else {
      process.env.EVALUATION_FRONTEND_URL = originalEvaluationFrontendUrl;
    }
    if (originalViteEvaluationFrontendUrl === undefined) {
      delete process.env.VITE_EVALUATION_FRONTEND_URL;
    } else {
      process.env.VITE_EVALUATION_FRONTEND_URL = originalViteEvaluationFrontendUrl;
    }
    vi.resetModules();
  });

  it("responds on healthz", async () => {
    const { createEvaluationApiApp } = await import("../src/app/create-app");
    const app = await createEvaluationApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("allows preflight from loopback dev origins", async () => {
    const { createEvaluationApiApp } = await import("../src/app/create-app");
    const app = await createEvaluationApiApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/experiments",
      headers: {
        origin: "http://127.0.0.1:3002",
        "access-control-request-method": "POST",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3002");
    await app.close();
  });

  it("does not allow preflight from non-loopback origins in development", async () => {
    const { createEvaluationApiApp } = await import("../src/app/create-app");
    const app = await createEvaluationApiApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/experiments",
      headers: {
        origin: "http://evil.com",
        "access-control-request-method": "POST",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("lists experiments with the preserved api/v1 path", async () => {
    experimentServiceMocks.listExperimentsService.mockResolvedValueOnce([
      {
        id: "exp-1",
        name: "smoke",
        status: "queued",
        case_count: 1,
        variant_count: 2,
        total_runs: 2,
        completed_runs: 0,
        failed_runs: 0,
        overall_success_rate: 0,
        created_at: "2026-03-23T00:00:00.000Z",
        updated_at: "2026-03-23T00:00:00.000Z",
      },
    ]);

    const { createEvaluationApiApp } = await import("../src/app/create-app");
    const app = await createEvaluationApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/experiments",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    await app.close();
  });

  it("returns trace artifacts as inline ndjson responses", async () => {
    artifactServiceMocks.getArtifactPathService.mockResolvedValueOnce("/tmp/fake-trace.json");
    fileMocks.loadBinaryFile.mockReturnValueOnce(Buffer.from("trace-payload"));

    const { createEvaluationApiApp } = await import("../src/app/create-app");
    const app = await createEvaluationApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/artifacts/run-1/trace",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-disposition"]).toContain('inline; filename="fake-trace.json"');
    expect(response.body).toBe("trace-payload");
    await app.close();
  });

  it("returns context snapshot artifacts through the generic artifact route", async () => {
    artifactServiceMocks.getArtifactPathService.mockResolvedValueOnce("/tmp/fake-context.json");
    fileMocks.loadBinaryFile.mockReturnValueOnce(Buffer.from("{\"ok\":true}"));

    const { createEvaluationApiApp } = await import("../src/app/create-app");
    const app = await createEvaluationApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/artifacts/run-1/runtime_context",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-disposition"]).toContain('inline; filename="fake-context.json"');
    expect(response.body).toBe("{\"ok\":true}");
    await app.close();
  });

  it("returns markdown artifacts as inline text responses", async () => {
    artifactServiceMocks.getArtifactPathService.mockResolvedValueOnce("/tmp/fake-prompt.system-prompt.md");
    fileMocks.loadBinaryFile.mockReturnValueOnce(Buffer.from("# prompt"));

    const { createEvaluationApiApp } = await import("../src/app/create-app");
    const app = await createEvaluationApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/artifacts/run-1/system_prompt",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/markdown");
    expect(response.headers["content-disposition"]).toContain(
      'inline; filename="fake-prompt.system-prompt.md"',
    );
    expect(response.body).toBe("# prompt");
    await app.close();
  });
});
