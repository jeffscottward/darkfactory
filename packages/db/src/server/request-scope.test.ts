import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRequestDatabase: vi.fn(),
  close: vi.fn<() => Promise<void>>(),
  db: { kind: "request-db" },
}));

vi.mock("./client.ts", () => ({
  createRequestDatabase: mocks.createRequestDatabase,
}));

import {
  openRequestScope,
  REQUEST_DATABASE_RETRY_AFTER_SECONDS,
  requestDatabaseCapacityResponse,
} from "./request-scope.ts";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

beforeEach(() => {
  mocks.close.mockReset().mockResolvedValue(undefined);
  mocks.createRequestDatabase
    .mockReset()
    .mockResolvedValue({ db: mocks.db, close: mocks.close });
});

describe("openRequestScope", () => {
  it("opens the request database with every option except the scheduler", async () => {
    const diagnosticSink = vi.fn();
    const scope = await openRequestScope({
      connectionString: "postgresql://scope",
      connectionTimeoutMillis: 5,
      diagnosticSink,
      schedule: vi.fn(),
    });

    expect(scope.db).toBe(mocks.db);
    expect(mocks.createRequestDatabase).toHaveBeenCalledWith({
      connectionString: "postgresql://scope",
      connectionTimeoutMillis: 5,
      diagnosticSink,
    });
    expect(Object.isFrozen(scope)).toBe(true);
  });

  it("propagates an open failure without scheduling anything", async () => {
    const failure = new Error("capacity");
    mocks.createRequestDatabase.mockRejectedValueOnce(failure);
    const schedule = vi.fn();

    await expect(
      openRequestScope({ connectionString: "postgresql://scope", schedule })
    ).rejects.toBe(failure);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("closes once, immediately, when no task was scheduled", async () => {
    const scheduleExternal = vi.fn();
    const scope = await openRequestScope({
      connectionString: "postgresql://scope",
      schedule: scheduleExternal,
    });

    const finalization = scope.finalize();
    expect(scope.finalize()).toBe(finalization);
    await finalization;
    expect(scope.finalize()).toBe(finalization);
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(scheduleExternal).not.toHaveBeenCalled();
  });

  it("drains scheduled tasks, including nested ones, before closing", async () => {
    const first = deferred();
    const second = deferred();
    const scheduleExternal = vi.fn((task: Promise<unknown>) => {
      task.catch(() => undefined);
    });
    const scope = await openRequestScope({
      connectionString: "postgresql://scope",
      schedule: scheduleExternal,
    });
    scope.schedule(first.promise.then(() => scope.schedule(second.promise)));

    let finalized = false;
    const finalization = scope.finalize().then(() => {
      finalized = true;
    });
    first.resolve();
    await vi.waitFor(() => expect(scheduleExternal).toHaveBeenCalledTimes(2));
    expect(mocks.close).not.toHaveBeenCalled();
    expect(finalized).toBe(false);

    second.resolve();
    await finalization;
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("settles rejected tasks before closing", async () => {
    const scope = await openRequestScope({
      connectionString: "postgresql://scope",
      schedule: (task) => {
        task.catch(() => undefined);
      },
    });
    scope.schedule(Promise.reject(new Error("background task failed")));

    await expect(scope.finalize()).resolves.toBeUndefined();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("swallows a close failure so finalization never rejects", async () => {
    mocks.close.mockRejectedValueOnce(new Error("end failed"));
    const scope = await openRequestScope({
      connectionString: "postgresql://scope",
      schedule: vi.fn(),
    });

    await expect(scope.finalize()).resolves.toBeUndefined();
    await expect(scope.finalize()).resolves.toBeUndefined();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("rejects tasks once closing has started", async () => {
    const close = deferred();
    mocks.close.mockReturnValueOnce(close.promise);
    const scheduleExternal = vi.fn();
    const scope = await openRequestScope({
      connectionString: "postgresql://scope",
      schedule: scheduleExternal,
    });

    const finalization = scope.finalize();
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
    expect(() => scope.schedule(Promise.resolve())).toThrow(
      "Request background task lifecycle is closing"
    );
    close.resolve();
    await finalization;
    expect(() => scope.schedule(Promise.resolve())).toThrow(
      "Request background task lifecycle is closing"
    );
    expect(scheduleExternal).not.toHaveBeenCalled();
  });
});

describe("requestDatabaseCapacityResponse", () => {
  it("is an exact 503 with a one-second retry-after and a coded body", async () => {
    const response = requestDatabaseCapacityResponse();

    expect(response.status).toBe(503);
    expect(REQUEST_DATABASE_RETRY_AFTER_SECONDS).toBe(1);
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toEqual({
      error: "Service temporarily at capacity",
      code: "DATABASE_CAPACITY",
    });
  });
});
