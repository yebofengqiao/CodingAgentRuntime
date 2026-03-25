import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const conversationServiceMocks = vi.hoisted(() => ({
  listConversationsService: vi.fn(),
  createConversationService: vi.fn(),
  deleteConversationService: vi.fn(),
  submitConversationMessageService: vi.fn(),
  conversationExists: vi.fn().mockResolvedValue(true),
}));

const eventServiceMocks = vi.hoisted(() => ({
  listConversationEventsService: vi.fn(),
  conversationExists: vi.fn().mockResolvedValue(true),
}));

const runServiceMocks = vi.hoisted(() => ({
  listConversationRunsService: vi.fn(),
  getConversationRunService: vi.fn(),
  conversationExists: vi.fn().mockResolvedValue(true),
}));

const actionServiceMocks = vi.hoisted(() => ({
  approveConversationActionService: vi.fn(),
  rejectConversationActionService: vi.fn(),
}));

const streamServiceMocks = vi.hoisted(() => ({
  conversationExists: vi.fn().mockResolvedValue(true),
  getConversationChannel: vi.fn(),
  replayConversationPackets: vi.fn().mockResolvedValue(undefined),
  getRedisClient: vi.fn(),
}));

vi.mock("../src/modules/conversations/service", () => conversationServiceMocks);
vi.mock("../src/modules/events/service", () => eventServiceMocks);
vi.mock("../src/modules/runs/service", () => runServiceMocks);
vi.mock("../src/modules/actions/service", () => actionServiceMocks);
vi.mock("../src/modules/events-stream/service", () => streamServiceMocks);

describe("conversation-api", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalConversationFrontendUrl = process.env.CONVERSATION_FRONTEND_URL;
  const originalViteConversationFrontendUrl = process.env.VITE_CONVERSATION_FRONTEND_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    process.env.CONVERSATION_FRONTEND_URL = "http://127.0.0.1:3000";
    delete process.env.VITE_CONVERSATION_FRONTEND_URL;
  });

  afterEach(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalConversationFrontendUrl === undefined) {
      delete process.env.CONVERSATION_FRONTEND_URL;
    } else {
      process.env.CONVERSATION_FRONTEND_URL = originalConversationFrontendUrl;
    }
    if (originalViteConversationFrontendUrl === undefined) {
      delete process.env.VITE_CONVERSATION_FRONTEND_URL;
    } else {
      process.env.VITE_CONVERSATION_FRONTEND_URL = originalViteConversationFrontendUrl;
    }
    vi.resetModules();
  });

  async function startConversationApiApp() {
    const { createConversationApiApp } = await import("../src/app/create-app");
    const app = await createConversationApiApp();
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as AddressInfo | null;
    if (!address) {
      throw new Error("Expected conversation-api to bind an address");
    }
    return {
      app,
      baseUrl: `http://127.0.0.1:${address.port}`,
    };
  }

  async function requestSseHeaders(url: string, origin: string) {
    return await new Promise<Record<string, string | string[] | undefined>>((resolve, reject) => {
      const request = httpRequest(
        url,
        {
          method: "GET",
          headers: {
            Origin: origin,
          },
        },
        (response) => {
          const headers = response.headers;
          response.destroy();
          resolve(headers);
        },
      );
      request.on("error", reject);
      request.end();
    });
  }

  it("responds on healthz", async () => {
    const { createConversationApiApp } = await import("../src/app/create-app");
    const app = await createConversationApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("allows delete preflight for loopback dev origins", async () => {
    const { createConversationApiApp } = await import("../src/app/create-app");
    const app = await createConversationApiApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/conversations/conv-1",
      headers: {
        origin: "http://127.0.0.1:3002",
        "access-control-request-method": "DELETE",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3002");
    await app.close();
  });

  it("does not allow preflight from non-loopback origins in development", async () => {
    const { createConversationApiApp } = await import("../src/app/create-app");
    const app = await createConversationApiApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/conversations/conv-1",
      headers: {
        origin: "http://evil.com",
        "access-control-request-method": "DELETE",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("keeps production cors strict to the configured frontend url", async () => {
    process.env.NODE_ENV = "production";
    const { createConversationApiApp } = await import("../src/app/create-app");
    const app = await createConversationApiApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/conversations/conv-1",
      headers: {
        origin: "http://127.0.0.1:3002",
        "access-control-request-method": "DELETE",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("returns allowed origin headers for sse loopback requests in development", async () => {
    const subscriber = {
      subscribe: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      disconnect: vi.fn(),
    };
    streamServiceMocks.replayConversationPackets.mockResolvedValueOnce([]);
    streamServiceMocks.getConversationChannel.mockReturnValueOnce("conversation:conv-1");
    streamServiceMocks.getRedisClient.mockReturnValueOnce({
      duplicate: vi.fn(() => subscriber),
    });

    const { app, baseUrl } = await startConversationApiApp();
    const headers = await requestSseHeaders(
      `${baseUrl}/conversations/conv-1/events/stream?after_seq=0`,
      "http://127.0.0.1:3002",
    );

    expect(headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3002");
    expect(headers["access-control-allow-credentials"]).toBe("true");
    await app.close();
  });

  it("rejects sse requests from disallowed origins", async () => {
    const { createConversationApiApp } = await import("../src/app/create-app");
    const app = await createConversationApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/conversations/conv-1/events/stream?after_seq=0",
      headers: {
        origin: "http://evil.com",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      detail: "Origin not allowed",
    });
    await app.close();
  });

  it("lists conversations through the controller/service boundary", async () => {
    conversationServiceMocks.listConversationsService.mockResolvedValueOnce([
      {
        conversation_id: "conv-1",
        execution_status: "idle",
        created_at: "2026-03-23T00:00:00.000Z",
        updated_at: "2026-03-23T00:00:00.000Z",
        last_event_at: null,
      },
    ]);

    const { createConversationApiApp } = await import("../src/app/create-app");
    const app = await createConversationApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/conversations",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(conversationServiceMocks.listConversationsService).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
