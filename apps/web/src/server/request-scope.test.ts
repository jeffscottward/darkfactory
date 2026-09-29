import type { SemanticEvent } from "@darkfactory/observability";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));
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
    const source = request({ "x-request-id": "parent-request.1" });

    const response = await withRequestScope(source, waitUntil, okRun);

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
            headers: { "x-request-id": "capacity-auth" },
          }),
          vi.fn()
        ),
      "capacity-auth",
    ],
    [
      "strict sign-out",
      () =>
        handleStrictSignOutRequest(
          new Request(
            "https://darkfactory.localhost/api/auth/strict-sign-out",
            {
              method: "POST",
              headers: { "x-request-id": "capacity-sign-out" },
            }
          ),
          vi.fn()
        ),
      "capacity-sign-out",
    ],
    [
      "oRPC",
      () =>
        handleOrpcRuntimeRequest(
          new Request(
            "https://darkfactory.localhost/api/orpc/dashboard/summary",
            { headers: { "x-request-id": "capacity-orpc" } }
          ),
          vi.fn()
        ),
      "capacity-orpc",
    ],
  ])("maps capacity exhaustion to the coded 503 in the %s handler", async (_name, handle, requestId) => {
    mocks.openRequestScope.mockRejectedValueOnce(
      new RequestDatabaseCapacityError()
    );

    await expectCapacity(await handle(), requestId);
    expect(mocks.createAuth).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});
