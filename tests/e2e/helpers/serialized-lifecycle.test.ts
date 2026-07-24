import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import {
  createSerializedLifecycle,
  isIntentionalLifecycleShutdownInterruption,
  LifecycleShutdownRequestedError,
} from "./serialized-lifecycle";
import { waitForE2EServerReady } from "./server-readiness";

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

  it("aborts hung readiness before exactly-once SIGTERM cleanup", async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess;
    const readinessShutdown = new AbortController();
    const probeEntered = deferred<void>();
    let cleanupCalls = 0;
    let readinessCommits = 0;
    const lifecycle = createSerializedLifecycle({
      cleanup: async () => {
        cleanupCalls += 1;
      },
      startup: async (control) => {
        try {
          await waitForE2EServerReady({
            child,
            onReady: async () => {
              readinessCommits += 1;
            },
            probe: async ({ signal }) =>
              await new Promise<boolean>((resolve) => {
                signal.addEventListener("abort", () => resolve(false), {
                  once: true,
                });
                probeEntered.resolve();
              }),
            signal: readinessShutdown.signal,
          });
        } catch (error) {
          if (readinessShutdown.signal.aborted) {
            control.checkpoint();
          }
          throw error;
        }
      },
    });

    await probeEntered.promise;
    const shutdown = lifecycle.control.requestShutdown(143);
    readinessShutdown.abort();
    const outcome = await shutdown;

    expect(outcome.exitCode).toBe(143);
    expect(outcome.startupError).toBeInstanceOf(
      LifecycleShutdownRequestedError
    );
    expect(cleanupCalls).toBe(1);
    expect(readinessCommits).toBe(0);
  });

  it("finishes stopped when SIGTERM interrupts startup after readiness", async () => {
    const ready = deferred<void>();
    const releaseStartup = deferred<void>();
    let intentional = false;
    let startupFailed = false;
    let status = "starting";
    const lifecycle = createSerializedLifecycle({
      cleanup: async () => {
        status = startupFailed ? "startup-failed" : "stopped";
      },
      startup: async ({ checkpoint }) => {
        try {
          status = "ready";
          ready.resolve();
          await releaseStartup.promise;
          checkpoint();
        } catch (error) {
          if (
            isIntentionalLifecycleShutdownInterruption({
              error,
              intentional,
            })
          ) {
            return;
          }
          startupFailed = true;
          throw error;
        }
      },
    });

    await ready.promise;
    intentional = true;
    const shutdown = lifecycle.control.requestShutdown(143);
    releaseStartup.resolve();

    await expect(shutdown).resolves.toEqual({ exitCode: 143 });
    expect(status).toBe("stopped");
    expect(startupFailed).toBe(false);
  });

  it("persists clean completion after intentional shutdown before readiness", async () => {
    const entered = deferred<void>();
    const releaseStartup = deferred<void>();
    let intentional = false;
    let startupFailed = false;
    let interruptedStartup = false;
    let status = "starting";
    const lifecycle = createSerializedLifecycle({
      cleanup: async () => {
        if (interruptedStartup) {
          status = "stopped";
        }
      },
      startup: async ({ checkpoint }) => {
        try {
          entered.resolve();
          await releaseStartup.promise;
          checkpoint();
        } catch (error) {
          if (
            isIntentionalLifecycleShutdownInterruption({
              error,
              intentional,
            })
          ) {
            interruptedStartup = true;
            return;
          }
          startupFailed = true;
          throw error;
        }
      },
    });

    await entered.promise;
    intentional = true;
    const shutdown = lifecycle.control.requestShutdown(143);
    releaseStartup.resolve();

    await expect(shutdown).resolves.toEqual({ exitCode: 143 });
    expect(startupFailed).toBe(false);
    expect(status).toBe("stopped");
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
