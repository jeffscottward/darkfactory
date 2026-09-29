import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const scope = {
    env: {
      APP_URL: "https://darkfactory.localhost",
      BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
    },
    requestId: "request-1",
    db: { kind: "request-db" },
    auth: { kind: "auth" },
  };
  return {
    scope,
    withRequestScope: vi.fn(
      async (
        _request: Request,
        _waitUntil: unknown,
        run: (value: typeof scope) => Promise<Response>,
        _internalParentRequestId?: string
      ) => run(scope)
    ),
    requestHandler: vi.fn(async (_request: Request) => new Response("handled")),
    createAuthHandler: vi.fn(),
    strictHandler: vi.fn(async () => new Response("signed out")),
    createDatabaseConfirmedSignOutHandler: vi.fn(),
    waitUntil: vi.fn(),
  };
});

vi.mock("../../../../server/request-scope.ts", () => ({
  withRequestScope: mocks.withRequestScope,
}));
vi.mock("@darkfactory/auth/server", () => ({
  createAuthHandler: mocks.createAuthHandler,
}));
vi.mock("@darkfactory/auth/db", () => ({
  createDatabaseConfirmedSignOutHandler:
    mocks.createDatabaseConfirmedSignOutHandler,
}));
vi.mock("cloudflare:workers", () => ({ waitUntil: mocks.waitUntil }));

import { handleStrictSignOutRequest } from "../strict-sign-out/handler.ts";
import { POST as strictSignOutPost } from "../strict-sign-out/route.ts";
import { AUTH_REQUEST_MAX_BYTES, handleAuthRequest } from "./handler.ts";
import { GET, POST } from "./route.ts";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAuthHandler.mockReturnValue(mocks.requestHandler);
  mocks.createDatabaseConfirmedSignOutHandler.mockReturnValue(
    mocks.strictHandler
  );
});

describe("Better Auth handler", () => {
  it("runs Better Auth inside the request scope", async () => {
    const waitUntil = vi.fn();
    const request = new Request(
      "https://darkfactory.localhost/api/auth/get-session",
      { headers: { cookie: "session=opaque" } }
    );

    const response = await handleAuthRequest(request, waitUntil, "parent-id");

    expect(await response.text()).toBe("handled");
    expect(mocks.withRequestScope).toHaveBeenCalledWith(
      request,
      waitUntil,
      expect.any(Function),
      "parent-id"
    );
    expect(mocks.createAuthHandler).toHaveBeenCalledWith(mocks.scope.auth);
    expect(mocks.requestHandler).toHaveBeenCalledWith(request);
  });

  it("rejects declared, lengthless, and lying oversized bodies before opening a scope", async () => {
    const oversizedStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(AUTH_REQUEST_MAX_BYTES));
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      });
    const declared = new Request(
      "https://darkfactory.localhost/api/auth/sign-in/email",
      {
        method: "POST",
        headers: { "content-length": String(AUTH_REQUEST_MAX_BYTES + 1) },
        body: "{}",
      }
    );
    const lengthless = new Request(
      "https://darkfactory.localhost/api/auth/sign-up/email",
      { method: "POST", body: oversizedStream(), duplex: "half" } as RequestInit
    );
    lengthless.headers.delete("content-length");
    const lying = new Request(
      "https://darkfactory.localhost/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "content-length": "1" },
        body: oversizedStream(),
        duplex: "half",
      } as RequestInit
    );

    const responses = await Promise.all(
      [declared, lengthless, lying].map((request) =>
        handleAuthRequest(request, vi.fn())
      )
    );

    expect(responses.map(({ status }) => status)).toEqual([413, 413, 413]);
    await expect(responses[0]!.json()).resolves.toEqual({
      error: "Payload Too Large",
    });
    expect(mocks.withRequestScope).not.toHaveBeenCalled();
  });

  it("reconstructs an exact-boundary credential request with cookies, metadata and signal", async () => {
    const controller = new AbortController();
    const source = new Request(
      "https://darkfactory.localhost/api/auth/sign-up/email?redirect=portal",
      {
        method: "POST",
        headers: {
          cookie: "session=opaque",
          "content-type": "application/octet-stream",
          "x-auth-marker": "preserved",
        },
        body: new Uint8Array(AUTH_REQUEST_MAX_BYTES),
        signal: controller.signal,
      }
    );
    source.headers.delete("content-length");

    const response = await handleAuthRequest(source, vi.fn());

    expect(response.status).toBe(200);
    const forwarded = mocks.requestHandler.mock.calls[0]![0];
    expect(mocks.withRequestScope.mock.calls[0]![0]).toBe(forwarded);
    expect(forwarded).not.toBe(source);
    expect(forwarded.url).toBe(source.url);
    expect(forwarded.method).toBe("POST");
    expect(forwarded.headers.get("cookie")).toBe("session=opaque");
    expect(forwarded.headers.get("x-auth-marker")).toBe("preserved");
    expect(forwarded.headers.get("content-length")).toBe(
      String(AUTH_REQUEST_MAX_BYTES)
    );
    expect((await forwarded.arrayBuffer()).byteLength).toBe(
      AUTH_REQUEST_MAX_BYTES
    );
    expect(forwarded.signal.aborted).toBe(false);
    controller.abort();
    expect(forwarded.signal.aborted).toBe(true);
  });
});

describe("strict sign-out handler", () => {
  it("builds the database-confirmed handler from the scope", async () => {
    const waitUntil = vi.fn();
    const request = new Request(
      "https://darkfactory.localhost/api/auth/strict-sign-out",
      { method: "POST" }
    );

    const response = await handleStrictSignOutRequest(request, waitUntil);

    expect(await response.text()).toBe("signed out");
    expect(mocks.withRequestScope).toHaveBeenCalledWith(
      request,
      waitUntil,
      expect.any(Function)
    );
    expect(mocks.createDatabaseConfirmedSignOutHandler).toHaveBeenCalledWith({
      auth: mocks.scope.auth,
      database: mocks.scope.db,
      secret: mocks.scope.env.BETTER_AUTH_SECRET,
      trustedOrigin: mocks.scope.env.APP_URL,
    });
    expect(mocks.strictHandler).toHaveBeenCalledWith(request);
  });
});

describe("auth Worker route adapters", () => {
  it("hands every route the Worker waitUntil", async () => {
    const responses = await Promise.all([
      GET(new Request("https://darkfactory.localhost/api/auth/get-session")),
      POST(
        new Request("https://darkfactory.localhost/api/auth/sign-out", {
          method: "POST",
        })
      ),
      strictSignOutPost(
        new Request("https://darkfactory.localhost/api/auth/strict-sign-out", {
          method: "POST",
        })
      ),
    ]);

    expect(await Promise.all(responses.map((r) => r.text()))).toEqual([
      "handled",
      "handled",
      "signed out",
    ]);
    const schedulers = mocks.withRequestScope.mock.calls.map(
      ([, schedule]) => schedule as (task: Promise<unknown>) => void
    );
    expect(schedulers).toHaveLength(3);
    for (const schedule of schedulers) {
      const task = Promise.resolve();
      schedule(task);
      expect(mocks.waitUntil).toHaveBeenLastCalledWith(task);
    }
    expect(mocks.waitUntil).toHaveBeenCalledTimes(3);
  });
});
