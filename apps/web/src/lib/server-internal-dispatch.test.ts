import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parentHeaders: vi.fn(async () => new Headers()),
  handleAuthRequest: vi.fn(),
  handleOrpcRuntimeRequest: vi.fn(),
  waitUntil: vi.fn(
    (task: Promise<unknown>) => void task.catch(() => undefined)
  ),
}));

vi.mock("cloudflare:workers", () => ({ waitUntil: mocks.waitUntil }));
vi.mock("next/headers", () => ({ headers: mocks.parentHeaders }));
vi.mock("../app/api/auth/[...all]/handler.ts", () => ({
  handleAuthRequest: mocks.handleAuthRequest,
}));
vi.mock("../app/api/orpc/[...rest]/route.ts", () => ({
  handleOrpcRuntimeRequest: mocks.handleOrpcRuntimeRequest,
}));

import {
  dispatchInternalAuthRequest,
  dispatchInternalOrpcRequest,
} from "./server-internal-dispatch.ts";

const deferredResponse = () => {
  let reject!: (error: unknown) => void;
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((settle, fail) => {
    reject = fail;
    resolve = settle;
    return;
  });
  return { promise, reject, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.parentHeaders.mockResolvedValue(
    new Headers({ "x-request-id": "parent-request" })
  );
  return vi.stubEnv("APP_URL", "https://darkfactory.localhost");
});

afterEach(() => vi.unstubAllEnvs());

describe("request-local internal dispatch", () => {
  it("delegates the auth session request, correlated with the parent, through the Worker scheduler", async () => {
    const response = new Response("auth-session", { status: 200 });
    const request = new Request(
      "https://darkfactory.localhost/api/auth/get-session",
      { method: "GET", headers: { cookie: "session=opaque" } }
    );
    mocks.handleAuthRequest.mockResolvedValueOnce(response);

    await expect(dispatchInternalAuthRequest(request)).resolves.toBe(response);
    const [forwarded, scheduler] = mocks.handleAuthRequest.mock.calls[0]!;
    expect(scheduler).toBe(mocks.waitUntil);
    expect(forwarded.url).toBe(request.url);
    expect(forwarded.headers.get("cookie")).toBe("session=opaque");
    expect(forwarded.headers.get("x-request-id")).toBe("parent-request");
    expect(request.headers.get("x-request-id")).toBeNull();
  });

  it("delegates the oRPC request with its body through the same Worker scheduler", async () => {
    const response = new Response("orpc", { status: 202 });
    const request = new Request(
      "https://darkfactory.localhost/api/orpc/dashboard/summary",
      { method: "POST", body: '{"json":{}}' }
    );
    mocks.handleOrpcRuntimeRequest.mockResolvedValueOnce(response);

    await expect(dispatchInternalOrpcRequest(request)).resolves.toBe(response);
    const [forwarded, scheduler] =
      mocks.handleOrpcRuntimeRequest.mock.calls[0]!;
    expect(scheduler).toBe(mocks.waitUntil);
    expect(forwarded.method).toBe("POST");
    expect(forwarded.headers.get("x-request-id")).toBe("parent-request");
    await expect(forwarded.text()).resolves.toBe('{"json":{}}');
  });

  it("replaces a caller-supplied id with the parent's cf-ray, or a fresh id", async () => {
    mocks.handleOrpcRuntimeRequest.mockImplementation(
      async () => new Response("orpc")
    );
    const dispatch = () =>
      dispatchInternalOrpcRequest(
        "https://darkfactory.localhost/api/orpc/preferences/theme/get",
        { method: "POST", headers: { "x-request-id": "caller-chosen" } }
      );

    mocks.parentHeaders.mockResolvedValueOnce(
      new Headers({ "cf-ray": "8f1e2d3c4b5a6978-SJC" })
    );
    await dispatch();
    mocks.parentHeaders.mockResolvedValueOnce(new Headers());
    await dispatch();

    const ids = mocks.handleOrpcRuntimeRequest.mock.calls.map(([forwarded]) =>
      forwarded.headers.get("x-request-id")
    );
    expect(ids[0]).toBe("8f1e2d3c4b5a6978-SJC");
    expect(ids[1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("constructs a request from fetch-compatible auth input", async () => {
    const response = new Response("auth-session", { status: 200 });
    mocks.handleAuthRequest.mockResolvedValueOnce(response);

    await expect(
      dispatchInternalAuthRequest(
        "https://darkfactory.localhost/api/auth/get-session",
        { headers: { cookie: "session=opaque" } }
      )
    ).resolves.toBe(response);

    const [request, scheduler] = mocks.handleAuthRequest.mock.calls[0]!;
    expect(request).toBeInstanceOf(Request);
    expect(request.url).toBe(
      "https://darkfactory.localhost/api/auth/get-session"
    );
    expect(request.headers.get("cookie")).toBe("session=opaque");
    return expect(scheduler).toBe(mocks.waitUntil);
  });

  it("does not start the auth runtime for an already-aborted request", async () => {
    const controller = new AbortController();
    const reason = new DOMException("session deadline", "AbortError");
    controller.abort(reason);
    const request = new Request(
      "https://darkfactory.localhost/api/auth/get-session",
      { signal: controller.signal }
    );

    await expect(dispatchInternalAuthRequest(request)).rejects.toBe(reason);
    expect(mocks.handleAuthRequest).not.toHaveBeenCalled();
    return expect(mocks.waitUntil).not.toHaveBeenCalled();
  });

  it("rejects an aborted auth dispatch while scheduling runtime cleanup", async () => {
    const operation = deferredResponse();
    const controller = new AbortController();
    const request = new Request(
      "https://darkfactory.localhost/api/auth/get-session",
      { signal: controller.signal }
    );
    mocks.handleAuthRequest.mockReturnValueOnce(operation.promise);

    const pending = dispatchInternalAuthRequest(request);
    const reason = new DOMException("session deadline", "AbortError");
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(mocks.waitUntil).toHaveBeenCalledOnce();
    const [scheduledCleanup] = mocks.waitUntil.mock.calls[0]!;
    operation.resolve(new Response("late auth response"));
    return await expect(scheduledCleanup).resolves.toBeUndefined();
  });

  it("does not start the oRPC runtime for an already-aborted request", async () => {
    const controller = new AbortController();
    const reason = new DOMException("summary deadline", "AbortError");
    controller.abort(reason);
    const request = new Request(
      "https://darkfactory.localhost/api/orpc/dashboard/summary",
      { signal: controller.signal }
    );

    await expect(dispatchInternalOrpcRequest(request)).rejects.toBe(reason);
    expect(mocks.handleOrpcRuntimeRequest).not.toHaveBeenCalled();
    return expect(mocks.waitUntil).not.toHaveBeenCalled();
  });

  it("absorbs a late oRPC runtime rejection after aborting the caller", async () => {
    const operation = deferredResponse();
    const controller = new AbortController();
    const request = new Request(
      "https://darkfactory.localhost/api/orpc/dashboard/summary",
      { signal: controller.signal }
    );
    mocks.handleOrpcRuntimeRequest.mockReturnValueOnce(operation.promise);

    const pending = dispatchInternalOrpcRequest(request);
    const reason = new DOMException("summary deadline", "AbortError");
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(mocks.waitUntil).toHaveBeenCalledOnce();
    const [scheduledCleanup] = mocks.waitUntil.mock.calls[0]!;
    operation.reject(new Error("late private runtime failure"));
    return await expect(scheduledCleanup).resolves.toBeUndefined();
  });

  it("propagates an oRPC runtime rejection before the caller aborts", async () => {
    const failure = new Error("private runtime failed");
    const controller = new AbortController();
    const request = new Request(
      "https://darkfactory.localhost/api/orpc/dashboard/summary",
      { signal: controller.signal }
    );
    mocks.handleOrpcRuntimeRequest.mockRejectedValueOnce(failure);

    await expect(dispatchInternalOrpcRequest(request)).rejects.toBe(failure);
    controller.abort();
    return expect(mocks.waitUntil).not.toHaveBeenCalled();
  });

  it("keeps late auth cleanup handled when Worker scheduling is unavailable", async () => {
    const operation = deferredResponse();
    const controller = new AbortController();
    const request = new Request(
      "https://darkfactory.localhost/api/auth/get-session",
      { signal: controller.signal }
    );
    mocks.handleAuthRequest.mockReturnValueOnce(operation.promise);
    mocks.waitUntil.mockImplementationOnce(() => {
      throw new Error("scheduler unavailable");
    });

    const pending = dispatchInternalAuthRequest(request);
    const reason = new DOMException("session deadline", "AbortError");
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    operation.resolve(new Response("late auth response"));
    return await expect(operation.promise).resolves.toBeInstanceOf(Response);
  });

  it("uses a default reason for an abort during listener registration", async () => {
    const operation = deferredResponse();
    const controller = new AbortController();
    const request = new Request(
      "https://darkfactory.localhost/api/orpc/dashboard/summary",
      { signal: controller.signal }
    );
    const addAbortListener = request.signal.addEventListener.bind(
      request.signal
    );
    Object.defineProperty(request.signal, "reason", {
      configurable: true,
      value: undefined,
    });
    vi.spyOn(request.signal, "addEventListener").mockImplementationOnce(
      (type, listener, options) => {
        addAbortListener(type, listener, options);
        controller.abort(new Error("runtime-specific reason"));
        return;
      }
    );
    mocks.handleOrpcRuntimeRequest.mockReturnValueOnce(operation.promise);

    const pending = dispatchInternalOrpcRequest(request);

    await expect(pending).rejects.toMatchObject({
      message: "The operation was aborted",
      name: "AbortError",
    });
    expect(mocks.waitUntil).toHaveBeenCalledOnce();
    const [scheduledCleanup] = mocks.waitUntil.mock.calls[0]!;
    operation.resolve(new Response("late oRPC response"));
    return await expect(scheduledCleanup).resolves.toBeUndefined();
  });

  it.each([
    [
      "an unexpected auth path",
      "https://darkfactory.localhost/api/auth/sign-in/email",
      "GET",
    ],
    [
      "an unexpected auth method",
      "https://darkfactory.localhost/api/auth/get-session",
      "POST",
    ],
    [
      "an unexpected auth origin",
      "https://attacker.invalid/api/auth/get-session",
      "GET",
    ],
  ])("rejects %s before auth handler delegation", async (_case, url, method) => {
    await expect(
      dispatchInternalAuthRequest(new Request(url, { method }))
    ).rejects.toThrow(
      "Internal auth dispatch requires GET /api/auth/get-session on the configured app origin"
    );
    return expect(mocks.handleAuthRequest).not.toHaveBeenCalled();
  });

  return it.each([
    [
      "an unexpected oRPC path",
      "https://darkfactory.localhost/api/auth/get-session",
      "GET",
    ],
    ["an empty oRPC route", "https://darkfactory.localhost/api/orpc/", "GET"],
    [
      "an unexpected oRPC method",
      "https://darkfactory.localhost/api/orpc/dashboard/summary",
      "OPTIONS",
    ],
    [
      "an unexpected oRPC origin",
      "https://attacker.invalid/api/orpc/dashboard/summary",
      "GET",
    ],
  ])("rejects %s before oRPC runtime delegation", async (_case, url, method) => {
    await expect(
      dispatchInternalOrpcRequest(new Request(url, { method }))
    ).rejects.toThrow(
      "Internal oRPC dispatch requires a routed API request on the configured app origin"
    );
    return expect(mocks.handleOrpcRuntimeRequest).not.toHaveBeenCalled();
  });
});
