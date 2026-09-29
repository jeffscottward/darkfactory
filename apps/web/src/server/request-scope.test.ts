import type { SemanticEvent } from "@darkfactory/observability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const env = {
    APP_ENV: "test",
    APP_URL: "https://darkfactory.localhost",
    BETTER_AUTH_URL: "https://darkfactory.localhost",
    BETTER_AUTH_SECRET: "configured-secret".repeat(2),
    EMAIL_TRANSPORT: "preview",
    EMAIL_FROM: "DarkFactory <noreply@domain.test>",
    RESEND_API_KEY: undefined,
    OTEL_SERVICE_NAME: "darkfactory-web",
  };
  return {
    env,
    parseServerEnv: vi.fn(() => env),
    composeDatabaseProfile: vi.fn(() => ({
      connection: { connectionString: "postgres://hyperdrive.invalid/db" },
    })),
    binding: {
      connectionString: "postgres://hyperdrive.invalid/db",
      trustedPlatform: "cloudflare-hyperdrive",
    },
    openRequestScope: vi.fn(),
    finalize: vi.fn(async () => undefined),
    trackedSchedule: vi.fn(),
    db: { kind: "request-db" },
    createAuth: vi.fn(() => ({ kind: "auth" })),
    parentHeaders: vi.fn(async () => new Headers()),
    selectEmailPort: vi.fn(() => ({ kind: "email" })),
    emit: vi.fn(async (_event: SemanticEvent) => undefined),
    createEvlogSink: vi.fn(),
    initializeEvlog: vi.fn(() => ({ kind: "evlog" })),
  };
});

vi.mock("cloudflare:workers", () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock("@darkfactory/config/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  parseServerEnv: mocks.parseServerEnv,
}));
vi.mock("@darkfactory/config/database", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  composeDatabaseProfile: mocks.composeDatabaseProfile,
}));
vi.mock("./database-binding.ts", () => ({
  resolveDatabaseRequestBinding: () => mocks.binding,
}));
vi.mock("@darkfactory/db/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openRequestScope: mocks.openRequestScope,
}));
vi.mock("@darkfactory/auth/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createAuth: mocks.createAuth,
  createAuthHandler: () => async () => new Response("session"),
}));
vi.mock("next/headers", () => ({ headers: mocks.parentHeaders }));
vi.mock("@darkfactory/email/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  selectEmailPort: mocks.selectEmailPort,
}));
vi.mock("@darkfactory/observability/server/evlog", () => ({
  createEvlogSink: mocks.createEvlogSink,
  initializeEvlog: mocks.initializeEvlog,
}));

import { RequestDatabaseCapacityError } from "@darkfactory/db/server";
import { handleAuthRequest } from "../app/api/auth/[...all]/handler.ts";
import { handleStrictSignOutRequest } from "../app/api/auth/strict-sign-out/handler.ts";
import { handleOrpcRuntimeRequest } from "../app/api/orpc/[...rest]/route.ts";
import { dispatchInternalAuthRequest } from "../lib/server-internal-dispatch.ts";
import { type WebRequestScope, withRequestScope } from "./request-scope.ts";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://darkfactory.localhost/api/auth/get-session", {
    headers,
  });
const okRun = vi.fn(async (_scope: WebRequestScope) =>
  Response.json({ ok: true }, { status: 201, headers: { "x-kept": "1" } })
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createEvlogSink.mockReturnValue({ emit: mocks.emit });
  mocks.openRequestScope.mockResolvedValue({
    db: mocks.db,
    schedule: mocks.trackedSchedule,
    finalize: mocks.finalize,
  });
});

describe("withRequestScope composition", () => {
  it("composes env, id, sink, Hyperdrive-aware DB, email and auth, then runs", async () => {
    const waitUntil = vi.fn();
    const source = request();

    const response = await withRequestScope(
      source,
      waitUntil,
      okRun,
      "parent-request.1"
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-kept")).toBe("1");
    expect(response.headers.get("x-request-id")).toBe("parent-request.1");
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.composeDatabaseProfile).toHaveBeenCalledWith(
      mocks.env,
      mocks.binding
    );
    expect(mocks.openRequestScope).toHaveBeenCalledWith({
      connectionString: "postgres://hyperdrive.invalid/db",
      schedule: waitUntil,
      diagnosticSink: expect.any(Function),
    });
    expect(mocks.createEvlogSink).toHaveBeenCalledWith({
      runtime: { kind: "evlog" },
      request: source,
      executionContext: { waitUntil },
    });
    expect(mocks.selectEmailPort).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "test",
        trustedAppOrigin: "https://darkfactory.localhost",
        previewDirectory: undefined,
        previewCaptureEndpoint: undefined,
      })
    );
    expect(mocks.createAuth).toHaveBeenCalledWith({
      database: mocks.db,
      email: { kind: "email" },
      secret: mocks.env.BETTER_AUTH_SECRET,
      baseURL: mocks.env.BETTER_AUTH_URL,
      trustedOrigins: [mocks.env.APP_URL],
      rateLimitEnabled: false,
      scheduleBackgroundTask: mocks.trackedSchedule,
    });
    expect(okRun).toHaveBeenCalledWith({
      env: mocks.env,
      requestId: "parent-request.1",
      sink: { emit: mocks.emit },
      db: mocks.db,
      auth: { kind: "auth" },
      schedule: mocks.trackedSchedule,
    });
  });

  it("enables Better Auth rate limiting outside the test environment", async () => {
    mocks.parseServerEnv.mockReturnValueOnce({
      ...mocks.env,
      APP_ENV: "production",
    });

    await withRequestScope(request(), vi.fn(), okRun);

    expect(mocks.createAuth).toHaveBeenCalledWith(
      expect.objectContaining({ rateLimitEnabled: true })
    );
  });

  it("emits DB diagnostics through evlog with the same request id", async () => {
    const scheduled: Promise<unknown>[] = [];
    const waitUntil = vi.fn((task: Promise<unknown>) => {
      scheduled.push(task);
    });

    await withRequestScope(
      request({ "cf-ray": "8f1e2d3c4b5a6978-SJC" }),
      waitUntil,
      okRun
    );
    const [{ diagnosticSink }] = mocks.openRequestScope.mock.calls[0]!;
    diagnosticSink({ code: "REQUEST_DATABASE_CLIENT_CLOSE_ERROR" });
    await Promise.all(scheduled);

    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "request-database.client-close-failed",
        correlation: { requestId: "8f1e2d3c4b5a6978-SJC" },
      })
    );
  });
});

describe("withRequestScope finalization", () => {
  it("schedules finalization through waitUntil instead of awaiting it", async () => {
    let releaseFinalize!: () => void;
    const pending = new Promise<undefined>((resolve) => {
      releaseFinalize = () => resolve(undefined);
    });
    mocks.finalize.mockReturnValueOnce(pending);
    const waitUntil = vi.fn();

    const response = await withRequestScope(request(), waitUntil, okRun);

    expect(response.status).toBe(201);
    expect(mocks.finalize).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledWith(pending);
    releaseFinalize();
  });

  it("falls back to awaiting finalization when waitUntil is unavailable", async () => {
    const order: string[] = [];
    mocks.finalize.mockImplementationOnce(async () => {
      await Promise.resolve();
      order.push("finalized");
    });
    const waitUntil = vi.fn(() => {
      throw new Error("no execution context");
    });

    await withRequestScope(request(), waitUntil, okRun);
    order.push("returned");

    expect(order).toEqual(["finalized", "returned"]);
  });

  it("still finalizes when run rejects, preserving the run error", async () => {
    const failure = new Error("run failed");
    const waitUntil = vi.fn();

    await expect(
      withRequestScope(request(), waitUntil, async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
    expect(mocks.finalize).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
  });

  it("rethrows a non-capacity open failure without running or finalizing", async () => {
    const failure = new Error("connect failed");
    mocks.openRequestScope.mockRejectedValueOnce(failure);

    await expect(withRequestScope(request(), vi.fn(), okRun)).rejects.toBe(
      failure
    );
    expect(okRun).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});

describe("database capacity mapping", () => {
  const expectCapacity = async (response: Response, requestId: string) => {
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    await expect(response.json()).resolves.toEqual({
      error: "Service temporarily at capacity",
      code: "DATABASE_CAPACITY",
    });
  };

  it.each([
    [
      "auth catch-all",
      () =>
        handleAuthRequest(
          new Request("https://darkfactory.localhost/api/auth/get-session", {
            headers: { "cf-ray": "0000000000000001-SJC" },
          }),
          vi.fn()
        ),
      "0000000000000001-SJC",
    ],
    [
      "strict sign-out",
      () =>
        handleStrictSignOutRequest(
          new Request(
            "https://darkfactory.localhost/api/auth/strict-sign-out",
            {
              method: "POST",
              headers: { "cf-ray": "0000000000000002-SJC" },
            }
          ),
          vi.fn()
        ),
      "0000000000000002-SJC",
    ],
    [
      "oRPC",
      () =>
        handleOrpcRuntimeRequest(
          new Request(
            "https://darkfactory.localhost/api/orpc/dashboard/summary",
            { headers: { "cf-ray": "0000000000000003-SJC" } }
          ),
          vi.fn()
        ),
      "0000000000000003-SJC",
    ],
  ])(
    "maps capacity exhaustion to the coded 503 in the %s handler",
    async (_name, handle, requestId) => {
      mocks.openRequestScope.mockRejectedValueOnce(
        new RequestDatabaseCapacityError()
      );

      await expectCapacity(await handle(), requestId);
      expect(mocks.createAuth).not.toHaveBeenCalled();
      expect(mocks.finalize).not.toHaveBeenCalled();
    }
  );
});

describe("request id trust boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("ignores a forged x-request-id on an external request and echoes the effective id", async () => {
    const response = await handleAuthRequest(
      request({ "x-request-id": "attacker-controlled" }),
      vi.fn()
    );

    const effective = response.headers.get("x-request-id");
    expect(effective).not.toBe("attacker-controlled");
    expect(effective).toMatch(/^[0-9a-f-]{36}$/);
    const [{ diagnosticSink }] = mocks.openRequestScope.mock.calls[0]!;
    diagnosticSink({ code: "REQUEST_DATABASE_CLIENT_ERROR" });
    await vi.waitFor(() =>
      expect(mocks.emit).toHaveBeenCalledWith(
        expect.objectContaining({ correlation: { requestId: effective } })
      )
    );
  });

  it("carries the parent id through in-process dispatch even when a header is forged", async () => {
    vi.stubEnv("APP_URL", "https://darkfactory.localhost");
    mocks.parentHeaders.mockResolvedValueOnce(
      new Headers({
        "cf-ray": "8f1e2d3c4b5a6978-SJC",
        "x-request-id": "attacker-parent",
      })
    );

    const response = await dispatchInternalAuthRequest(
      request({ "x-request-id": "attacker-controlled" })
    );

    expect(await response.text()).toBe("session");
    expect(response.headers.get("x-request-id")).toBe("8f1e2d3c4b5a6978-SJC");
  });
});
