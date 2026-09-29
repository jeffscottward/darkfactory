import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CAPACITY_RETRY_DELAY_MS,
  CAPACITY_RETRY_MAX_ATTEMPTS,
  isCapacityResponse,
  ownErrorData,
  retryOnCapacity,
} from "./capacity-retry.ts";

const capacityResponse = (): Response =>
  Response.json(
    { error: "Service temporarily at capacity", code: "DATABASE_CAPACITY" },
    { status: 503, headers: { "retry-after": "1" } }
  );
const capacityFailure = Object.freeze({
  defined: false,
  code: "SERVICE_UNAVAILABLE",
  status: 503,
});
const request = () => new Request("https://darkfactory.example/api/orpc");

/** An operation that sends one request through the observed transport, then decodes like the oRPC client. */
const decodeThrough =
  (decode: (response: Response) => unknown) =>
  async (observed: (request: Request) => Promise<Response>) => {
    const response = await observed(request());
    const decoded = decode(response);
    if (response.ok) return decoded;
    throw decoded;
  };

afterEach(() => vi.useRealTimers());

describe("isCapacityResponse", () => {
  it("accepts only the exact 503 with retry-after 1", () => {
    expect(isCapacityResponse(capacityResponse())).toBe(true);
    expect(isCapacityResponse(new Response(null, { status: 503 }))).toBe(false);
    expect(
      isCapacityResponse(
        new Response(null, { status: 503, headers: { "retry-after": "2" } })
      )
    ).toBe(false);
    expect(
      isCapacityResponse(
        new Response(null, { status: 500, headers: { "retry-after": "1" } })
      )
    ).toBe(false);
  });
});

describe("ownErrorData", () => {
  it("reads own data properties and never runs accessors or traps", () => {
    const getter = vi.fn(() => "leaked");
    const accessor = Object.defineProperty({}, "code", { get: getter });
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor: () => {
          throw new Error("trap");
        },
      }
    );

    expect(ownErrorData({ code: "X" }, "code")).toBe("X");
    expect(ownErrorData(null, "code")).toBeUndefined();
    expect(ownErrorData("primitive", "code")).toBeUndefined();
    expect(ownErrorData({}, "code")).toBeUndefined();
    expect(ownErrorData(accessor, "code")).toBeUndefined();
    expect(ownErrorData(hostile, "code")).toBeUndefined();
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("retryOnCapacity", () => {
  it("retries a capacity failure after one second and returns the next result", async () => {
    vi.useFakeTimers();
    const transport = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(capacityResponse())
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const result = retryOnCapacity(
      transport,
      new AbortController().signal,
      decodeThrough((response) =>
        response.ok ? "ready" : { ...capacityFailure }
      )
    );

    await vi.advanceTimersByTimeAsync(CAPACITY_RETRY_DELAY_MS - 1);
    expect(transport).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("ready");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rethrows the last capacity failure after the maximum attempts", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(async () => capacityResponse());
    const result = retryOnCapacity(
      transport,
      new AbortController().signal,
      decodeThrough(() => ({ ...capacityFailure }))
    );
    const settled = expect(result).rejects.toEqual(capacityFailure);

    await vi.advanceTimersByTimeAsync(
      CAPACITY_RETRY_DELAY_MS * CAPACITY_RETRY_MAX_ATTEMPTS
    );
    await settled;
    expect(transport).toHaveBeenCalledTimes(CAPACITY_RETRY_MAX_ATTEMPTS);
  });

  it.each([
    [
      "a declared 503",
      { defined: true, code: "SERVICE_UNAVAILABLE", status: 503 },
    ],
    [
      "another code",
      { defined: false, code: "INTERNAL_SERVER_ERROR", status: 503 },
    ],
    [
      "another status",
      { defined: false, code: "SERVICE_UNAVAILABLE", status: 500 },
    ],
  ])(
    "never retries %s even after a capacity response",
    async (_name, error) => {
      const transport = vi.fn(async () => capacityResponse());

      await expect(
        retryOnCapacity(
          transport,
          new AbortController().signal,
          decodeThrough(() => error)
        )
      ).rejects.toBe(error);
      expect(transport).toHaveBeenCalledOnce();
    }
  );

  it("never retries a matching error whose raw response was not capacity", async () => {
    const transport = vi.fn(async () => new Response(null, { status: 503 }));

    await expect(
      retryOnCapacity(
        transport,
        new AbortController().signal,
        decodeThrough(() => ({ ...capacityFailure }))
      )
    ).rejects.toEqual(capacityFailure);
    expect(transport).toHaveBeenCalledOnce();
  });

  it("does not reuse an earlier capacity observation for a later failure", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(async () => capacityResponse());
    let calls = 0;
    const result = retryOnCapacity(
      transport,
      new AbortController().signal,
      async (observed) => {
        calls += 1;
        if (calls === 1) await observed(request());
        throw { ...capacityFailure };
      }
    );
    const settled = expect(result).rejects.toEqual(capacityFailure);

    await vi.advanceTimersByTimeAsync(CAPACITY_RETRY_DELAY_MS);
    await settled;
    expect(calls).toBe(2);
  });

  it("stops when the signal aborts during the capacity wait", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const transport = vi.fn(async () => capacityResponse());
    const result = retryOnCapacity(
      transport,
      controller.signal,
      decodeThrough(() => ({ ...capacityFailure }))
    );
    const settled = expect(result).rejects.toEqual(capacityFailure);

    await vi.advanceTimersByTimeAsync(CAPACITY_RETRY_DELAY_MS / 2);
    controller.abort();
    await settled;
    expect(transport).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not wait when the signal aborted while the attempt failed", async () => {
    const controller = new AbortController();
    const reason = new Error("deadline");

    await expect(
      retryOnCapacity(
        async () => capacityResponse(),
        controller.signal,
        async (observed) => {
          await observed(request());
          controller.abort(reason);
          throw { ...capacityFailure };
        }
      )
    ).rejects.toBe(reason);
  });

  it("does not start, or return, once the signal has aborted", async () => {
    const aborted = new AbortController();
    const reason = new Error("cancelled");
    aborted.abort(reason);
    const operation = vi.fn(async () => "unused");

    await expect(
      retryOnCapacity(async () => capacityResponse(), aborted.signal, operation)
    ).rejects.toBe(reason);
    expect(operation).not.toHaveBeenCalled();

    const late = new AbortController();
    await expect(
      retryOnCapacity(
        async () => capacityResponse(),
        late.signal,
        async () => {
          late.abort(reason);
          return "too late";
        }
      )
    ).rejects.toBe(reason);
  });
});
