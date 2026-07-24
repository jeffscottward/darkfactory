import { describe, expect, it } from "vitest";

import {
  createSerializedLifecycle,
  LifecycleShutdownRequestedError,
} from "./serialized-lifecycle";

const deferred = <Value>(): Readonly<{
  promise: Promise<Value>;
  resolve: (value: Value) => void;
}> => {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe("serialized E2E startup and shutdown", () => {
  it("waits for an in-flight allocation checkpoint before one final cleanup", async () => {
    const entered = deferred<void>();
    const releaseAllocation = deferred<void>();
    let resourceAllocated = false;
    let cleanupCalls = 0;
    const lifecycle = createSerializedLifecycle({
      cleanup: async () => {
        cleanupCalls += 1;
        expect(resourceAllocated).toBe(true);
      },
      startup: async ({ checkpoint }) => {
        entered.resolve();
        await releaseAllocation.promise;
        resourceAllocated = true;
        checkpoint();
      },
    });

    await entered.promise;
    const shutdown = lifecycle.control.requestShutdown(143);
    releaseAllocation.resolve();
    const outcome = await shutdown;

    expect(outcome.exitCode).toBe(143);
    expect(outcome.startupError).toBeInstanceOf(
      LifecycleShutdownRequestedError
    );
    expect(outcome.cleanupError).toBeUndefined();
    expect(cleanupCalls).toBe(1);
  });

  it("memoizes concurrent shutdown requests and never repeats cleanup", async () => {
    const entered = deferred<void>();
    const releaseStartup = deferred<void>();
    let cleanupCalls = 0;
    const lifecycle = createSerializedLifecycle({
      cleanup: async () => {
        cleanupCalls += 1;
      },
      startup: async ({ checkpoint }) => {
        entered.resolve();
        await releaseStartup.promise;
        checkpoint();
      },
    });

    await entered.promise;
    const first = lifecycle.control.requestShutdown(130);
    const second = lifecycle.control.requestShutdown(143);
    expect(second).toBe(first);
    releaseStartup.resolve();

    await expect(first).resolves.toMatchObject({ exitCode: 130 });
    expect(cleanupCalls).toBe(1);
  });
});
