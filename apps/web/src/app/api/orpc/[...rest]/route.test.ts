import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const env = {
    APP_ENV: "test",
    APP_URL: "https://darkfactory.localhost",
    EMAIL_TRANSPORT: "preview",
    EMAIL_FROM: "DarkFactory <noreply@domain.test>",
    RESEND_API_KEY: undefined,
    CONTACT_EMAIL_TO: "support@domain.test",
    BETTER_AUTH_SECRET: "configured-secret".repeat(2),
    CONTACT_THROTTLE_SECRET: "contact-throttle-secret".repeat(2),
    BETTER_AUTH_URL: "https://darkfactory.localhost",
    OTEL_ENABLED: true,
    OTEL_SERVICE_NAME: "darkfactory-web",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.configured.test:4318/base",
    POSTHOG_KEY: "configured-posthog-key",
    POSTHOG_HOST: "https://analytics.configured.test",
  } as Record<string, unknown>;
  const scope = {
    env,
    requestId: "request-stable",
    sink: { emit: vi.fn() },
    db: { request: true },
    auth: { auth: true },
    schedule: vi.fn(),
  };
  const span = { correlation: {}, addEvent: vi.fn(), recordMetric: vi.fn() };
  const withSpan = vi.fn(
    async (_input: unknown, run: (s: unknown) => unknown) => run(span)
  );
  const forceFlush = vi.fn(async () => undefined);
  const consumeContactThrottle = vi.fn();
  return {
    env,
    scope,
    span,
    withSpan,
    forceFlush,
    consumeContactThrottle,
    waitUntil: vi.fn((task: Promise<unknown>) => {
      task.catch(() => undefined);
    }),
    withRequestScope: vi.fn(
      async (
        _request: Request,
        _waitUntil: unknown,
        run: (value: typeof scope) => Promise<Response>
      ) => run(scope)
    ),
    parseServerEnv: vi.fn(() => env),
    initializeTelemetry: vi.fn(() => ({ withSpan, forceFlush })),
    createPostHogAnalyticsPort: vi.fn(() => ({ capture: vi.fn() })),
    createSemanticEventFanout: vi.fn(
      (_options: { resolveConsent: () => string }) => ({ emit: vi.fn() })
    ),
    createApiContext: vi.fn((_request: Request, dependencies: object) => ({
      ...dependencies,
    })),
    createRepositories: vi.fn(() => ({ featureItems: {} })),
    createContactThrottleRepository: vi.fn(() => ({
      consume: consumeContactThrottle,
    })),
    selectContactEmailPort: vi.fn(() => ({ sendContact: vi.fn() })),
    requireSession: vi.fn(),
    requireRole: vi.fn(),
    handleOrpcRequest: vi.fn(
      async (_request: Request, _context: unknown) =>
        new Response("handled", { status: 202 })
    ),
  };
});

vi.mock("cloudflare:workers", () => ({ waitUntil: mocks.waitUntil }));
vi.mock("../../../../server/request-scope.ts", () => ({
  withRequestScope: mocks.withRequestScope,
}));
vi.mock("@darkfactory/api/server", () => ({
  createApiContext: mocks.createApiContext,
}));
vi.mock("@darkfactory/analytics/server/posthog", () => ({
  createPostHogAnalyticsPort: mocks.createPostHogAnalyticsPort,
}));
vi.mock("@darkfactory/auth/server", () => ({
  requireSession: mocks.requireSession,
  requireRole: mocks.requireRole,
}));
vi.mock("@darkfactory/config/server", () => ({
  parseServerEnv: mocks.parseServerEnv,
  getProviderCapabilities: () => ({ ai: false }),
}));
vi.mock("@darkfactory/db/server", () => ({
  createRepositories: mocks.createRepositories,
  createContactThrottleRepository: mocks.createContactThrottleRepository,
}));
vi.mock("@darkfactory/email/server", () => ({
  selectContactEmailPort: mocks.selectContactEmailPort,
}));
vi.mock("@darkfactory/observability/server/fanout", () => ({
  createSemanticEventFanout: mocks.createSemanticEventFanout,
}));
vi.mock("@darkfactory/observability/server/otel", () => ({
  initializeTelemetry: mocks.initializeTelemetry,
}));
vi.mock("./handler.ts", () => ({ handleOrpcRequest: mocks.handleOrpcRequest }));

import { CONTACT_REQUEST_MAX_BYTES } from "./contact-runtime.ts";
import {
  DELETE,
  GET,
  handleOrpcRuntimeRequest,
  ORPC_REQUEST_MAX_BYTES,
  PATCH,
  POST,
} from "./route.ts";

const ORIGIN = "https://darkfactory.localhost";
const contactRequest = (init: RequestInit = {}) =>
  new Request(`${ORIGIN}/api/orpc/contact/submit`, {
    method: "POST",
    body: "{}",
    ...init,
    headers: { origin: ORIGIN, ...init.headers },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("E2E_FIXTURES", "0");
  mocks.handleOrpcRequest.mockImplementation(
    async () => new Response("handled", { status: 202 })
  );
  mocks.consumeContactThrottle.mockResolvedValue({
    allowed: true,
    remaining: 4,
    retryAfterSeconds: 0,
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("oRPC Worker route composition", () => {
  it("runs one correlated span, lazy runtimes and the API context inside the scope", async () => {
    const first = new Request(`${ORIGIN}/api/orpc/featureItems/create`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "sec-fetch-site": "same-origin",
        "x-analytics-consent": "granted",
      },
    });
    const second = new Request(`${ORIGIN}/api/orpc/featureItems/update`, {
      method: "POST",
      headers: { origin: ORIGIN },
    });

    expect((await POST(first)).status).toBe(202);
    expect((await POST(second)).status).toBe(202);

    expect(mocks.withRequestScope).toHaveBeenCalledTimes(2);
    expect(mocks.withRequestScope.mock.calls[0]![1]).toBe(mocks.waitUntil);
    expect(mocks.initializeTelemetry).toHaveBeenCalledOnce();
    expect(mocks.initializeTelemetry).toHaveBeenCalledWith({
      enabled: true,
      serviceName: "darkfactory-web",
      otlpEndpoint: "https://collector.configured.test:4318/base",
      otlpAllowedHosts: ["collector.configured.test"],
    });
    expect(mocks.createPostHogAnalyticsPort).toHaveBeenCalledOnce();
    expect(mocks.withSpan.mock.calls[0]![0]).toEqual({
      name: "orpc.request",
      correlation: { requestId: "request-stable", route: "/api/orpc" },
      attributes: { "rpc.system": "orpc" },
    });
    expect(mocks.forceFlush).toHaveBeenCalledTimes(2);

    const dependencies = mocks.createApiContext.mock.calls[0]![1] as Record<
      string,
      unknown
    >;
    expect(dependencies).toMatchObject({
      requestId: "request-stable",
      span: mocks.span,
      waitUntil: mocks.waitUntil,
      repositories: { featureItems: {} },
      capabilities: { ai: false },
    });
    expect(dependencies).not.toHaveProperty("contactThrottleKey");
    expect(mocks.createRepositories).toHaveBeenCalledWith(mocks.scope.db);
    const fanout = mocks.createSemanticEventFanout.mock.calls.map(
      ([options]) => options
    );
    expect(fanout[0]).toMatchObject({ sink: mocks.scope.sink });
    expect(fanout[0]!.resolveConsent()).toBe("granted");
    expect(fanout[1]!.resolveConsent()).toBe("unknown");

    const headers = new Headers({ authorization: "Bearer opaque" });
    await (dependencies["requireSession"] as (h: Headers) => unknown)(headers);
    await (dependencies["requireRole"] as (h: Headers, r: string) => unknown)(
      headers,
      "admin"
    );
    expect(mocks.requireSession).toHaveBeenCalledWith(
      mocks.scope.auth,
      headers
    );
    expect(mocks.requireRole).toHaveBeenCalledWith(
      mocks.scope.auth,
      headers,
      "admin"
    );
  });

  it("rejects unsupported methods and unsafe origins before opening a scope", async () => {
    const put = await handleOrpcRuntimeRequest(
      new Request(`${ORIGIN}/api/orpc/dashboard/summary`, { method: "PUT" }),
      mocks.waitUntil
    );
    expect(put.status).toBe(405);
    expect(put.headers.get("allow")).toBe("GET, POST, PATCH, DELETE");

    for (const headers of [
      {},
      { origin: "https://attacker.invalid" },
      { origin: ORIGIN, "sec-fetch-site": "cross-site" },
    ]) {
      const response = await POST(
        new Request(`${ORIGIN}/api/orpc/preferences/update`, {
          method: "POST",
          headers,
        })
      );
      expect(response.status).toBe(403);
    }
    expect(mocks.withRequestScope).not.toHaveBeenCalled();
  });

  it("rejects declared, lying, and lengthless oversized bodies before opening a scope", async () => {
    const oversizedStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(ORPC_REQUEST_MAX_BYTES));
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      });
    const url = `${ORIGIN}/api/orpc/featureItems/create`;
    const declared = new Request(url, {
      method: "POST",
      headers: {
        "content-length": String(ORPC_REQUEST_MAX_BYTES + 1),
        origin: ORIGIN,
      },
      body: "small",
    });
    const lying = new Request(url, {
      method: "POST",
      headers: { "content-length": "1", origin: ORIGIN },
      body: oversizedStream(),
      duplex: "half",
    } as RequestInit);
    const lengthless = new Request(url, {
      method: "POST",
      headers: { origin: ORIGIN },
      body: oversizedStream(),
      duplex: "half",
    } as RequestInit);
    lengthless.headers.delete("content-length");

    const responses = await Promise.all([
      POST(declared),
      POST(lying),
      POST(lengthless),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([413, 413, 413]);
    expect(mocks.withRequestScope).not.toHaveBeenCalled();
  });

  it("hands the scope an exact-boundary body with its request metadata", async () => {
    const request = new Request(
      `${ORIGIN}/api/orpc/featureItems/update?source=operator`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/octet-stream",
          origin: ORIGIN,
          "x-request-marker": "preserved",
        },
        body: new Uint8Array(ORPC_REQUEST_MAX_BYTES),
      }
    );
    request.headers.delete("content-length");

    expect((await PATCH(request)).status).toBe(202);
    const forwarded = mocks.handleOrpcRequest.mock.calls[0]![0];
    expect(mocks.withRequestScope.mock.calls[0]![0]).toBe(forwarded);
    expect(forwarded).not.toBe(request);
    expect(forwarded.url).toBe(request.url);
    expect(forwarded.headers.get("x-request-marker")).toBe("preserved");
    expect((await forwarded.arrayBuffer()).byteLength).toBe(
      ORPC_REQUEST_MAX_BYTES
    );
  });

  it("serves every exported HTTP method through the same scope", async () => {
    await expect(
      GET(new Request(`${ORIGIN}/api/orpc/dashboard/summary`))
    ).resolves.toMatchObject({ status: 202 });
    for (const [handler, method] of [
      [PATCH, "PATCH"],
      [DELETE, "DELETE"],
    ] as const) {
      await expect(
        handler(
          new Request(`${ORIGIN}/api/orpc/featureItems/archive`, {
            method,
            headers: { origin: ORIGIN },
          })
        )
      ).resolves.toMatchObject({ status: 202 });
    }
    expect(mocks.withRequestScope).toHaveBeenCalledTimes(3);
  });

  it("omits optional telemetry and analytics configuration when absent", async () => {
    mocks.parseServerEnv.mockReturnValueOnce({
      ...mocks.env,
      OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
      POSTHOG_KEY: undefined,
      POSTHOG_HOST: undefined,
    });
    const scopeEnv = mocks.scope.env;
    mocks.scope.env = {
      ...mocks.env,
      POSTHOG_KEY: undefined,
      POSTHOG_HOST: undefined,
    };
    vi.resetModules();
    // A fresh module instance is the only way to observe the lazy, module-level runtimes being built.
    const freshRoute = await import("./route.ts");

    try {
      await expect(
        freshRoute.GET(new Request(`${ORIGIN}/api/orpc/dashboard/summary`))
      ).resolves.toMatchObject({ status: 202 });
    } finally {
      mocks.scope.env = scopeEnv;
    }
    expect(mocks.initializeTelemetry).toHaveBeenCalledWith({
      enabled: true,
      serviceName: "darkfactory-web",
    });
    expect(mocks.createPostHogAnalyticsPort).toHaveBeenCalledWith({});
  });
});

describe("oRPC contact submission admission", () => {
  it("adds the contact ports after the edge throttle admits the request", async () => {
    expect((await POST(contactRequest())).status).toBe(202);

    expect(mocks.createContactThrottleRepository).toHaveBeenCalledWith(
      mocks.scope.db,
      { maxRequests: 30 }
    );
    expect(mocks.createContactThrottleRepository).toHaveBeenCalledWith(
      mocks.scope.db
    );
    const [edgeKey] = mocks.consumeContactThrottle.mock.calls[0]!;
    const dependencies = mocks.createApiContext.mock.calls[0]![1] as Record<
      string,
      unknown
    >;
    expect(dependencies["contactThrottleKey"]).toEqual(expect.any(String));
    expect(dependencies["contactThrottleKey"]).not.toBe(edgeKey);
    expect(dependencies["contactDelivery"]).toEqual({
      sendContact: expect.any(Function),
    });
    expect(mocks.selectContactEmailPort).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "test",
        recipient: "support@domain.test",
        previewDirectory: undefined,
      })
    );
  });

  it("counts malformed contact requests in the pre-parse edge bucket", async () => {
    mocks.handleOrpcRequest.mockResolvedValue(
      new Response("invalid", { status: 400 })
    );
    mocks.consumeContactThrottle
      .mockResolvedValueOnce({
        allowed: true,
        remaining: 1,
        retryAfterSeconds: 0,
      })
      .mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 600,
      });

    const accepted = await POST(contactRequest({ body: "{" }));
    const denied = await POST(contactRequest({ body: "{" }));

    expect(accepted.status).toBe(400);
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("600");
    await expect(denied.json()).resolves.toMatchObject({
      json: { defined: true, code: "TOO_MANY_REQUESTS", status: 429 },
    });
    expect(mocks.handleOrpcRequest).toHaveBeenCalledOnce();
  });

  it("returns 413 for an oversized declared or chunked payload only after edge throttling", async () => {
    const declared = await POST(
      contactRequest({
        headers: { "content-length": String(CONTACT_REQUEST_MAX_BYTES + 1) },
        body: "small",
      })
    );
    const chunked = await POST(
      contactRequest({
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(CONTACT_REQUEST_MAX_BYTES));
            controller.enqueue(new Uint8Array([1]));
            controller.close();
          },
        }),
        duplex: "half",
      } as RequestInit)
    );

    expect([declared.status, chunked.status]).toEqual([413, 413]);
    await expect(declared.json()).resolves.toMatchObject({
      json: { defined: true, code: "PAYLOAD_TOO_LARGE", status: 413 },
    });
    expect(mocks.consumeContactThrottle).toHaveBeenCalledTimes(2);
    expect(mocks.withRequestScope).toHaveBeenCalledTimes(2);
    expect(mocks.handleOrpcRequest).not.toHaveBeenCalled();
  });

  it("gives an edge denial precedence over an oversized payload", async () => {
    mocks.consumeContactThrottle.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 45,
    });

    const response = await POST(
      contactRequest({
        headers: { "content-length": String(CONTACT_REQUEST_MAX_BYTES + 1) },
        body: "small",
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("45");
    expect(mocks.handleOrpcRequest).not.toHaveBeenCalled();
  });

  it("returns a typed 503 when edge throttle storage fails", async () => {
    mocks.consumeContactThrottle.mockRejectedValueOnce(
      new Error("private database detail")
    );

    const response = await POST(contactRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeNull();
    const body = await response.json();
    expect(body).toMatchObject({
      json: { defined: true, code: "SERVICE_UNAVAILABLE", status: 503 },
    });
    expect(JSON.stringify(body)).not.toContain("private");
    expect(mocks.handleOrpcRequest).not.toHaveBeenCalled();
  });

  it("isolates the contact preview inside a proven E2E run", async () => {
    const runId = "route_run";
    vi.stubEnv("E2E_FIXTURES", "1");
    vi.stubEnv("E2E_RUN_ID", runId);
    vi.stubEnv("E2E_EMAIL_PREVIEW_HMAC_KEY", "a".repeat(43));
    vi.stubEnv(
      "E2E_EMAIL_PREVIEW_ENDPOINT",
      "http://127.0.0.1:43123/v1/capture"
    );
    vi.stubEnv(
      "E2E_EMAIL_PREVIEW_DIRECTORY",
      `/repo/test-results/e2e-runs/${runId}/previews/auth`
    );

    expect((await POST(contactRequest())).status).toBe(202);
    expect(mocks.selectContactEmailPort).toHaveBeenCalledWith(
      expect.objectContaining({
        previewDirectory: `/repo/test-results/e2e-runs/${runId}/previews/contact`,
        previewCaptureEndpoint: "http://127.0.0.1:43123/v1/capture",
        previewBinding: { runId, hmacKey: "a".repeat(43) },
      })
    );
  });
});
