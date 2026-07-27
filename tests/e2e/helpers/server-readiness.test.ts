import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createServer } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { E2ELifecycleState } from "./run-artifacts";

import {
  allocateE2EServerPort,
  classifyE2EServerExit,
  createPromiseResolvers,
  probeE2EServerPort,
  probeE2EServerTarget,
  probeE2EServerRoutes,
  waitForE2ELifecycleReady,
  waitForE2EServerReady,
  type E2EReadinessProbeContext,
  type PromiseResolvers,
  type E2EServerExitState,
} from "./server-readiness";

const BLOCKING_CHILD_SOURCE =
  "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)";
const children = new Set<ChildProcess>();

const yieldToChild = (): Promise<void> => {
  const { promise, resolve } = createPromiseResolvers<void>();
  setImmediate(resolve);
  return promise;
};

const spawnFixture = (source: string): ChildProcess => {
  const child = spawn(
    process.execPath,
    ["--input-type=module", "--eval", source],
    { stdio: "ignore" }
  );
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
};

const waitForExit = async (
  child: ChildProcess
): Promise<E2EServerExitState> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { exitCode: child.exitCode, signal: child.signalCode };
  }
  const { promise, resolve } = createPromiseResolvers<E2EServerExitState>();
  child.once("exit", (exitCode, signal) => resolve({ exitCode, signal }));
  return promise;
};

afterEach(async () => {
  await Promise.all(
    [...children].map(async (child) => {
      child.kill("SIGTERM");
      await waitForExit(child);
    })
  );
  children.clear();
});

describe("owned E2E server readiness", () => {
  it("fails startup when the real child exits before readiness", async () => {
    const child = spawnFixture("process.exit(7)");
    await expect(
      waitForE2EServerReady({
        child,
        probe: async () => false,
        timeoutMillis: 1000,
        wait: async () => {
          await yieldToChild();
        },
      })
    ).rejects.toThrow(/before readiness/i);
    const state = await waitForExit(child);
    expect(
      classifyE2EServerExit({ intentional: false, ready: false, state })
    ).toBe("startup-failed");
  });

  it("fails startup on the bounded readiness deadline", async () => {
    const child = spawnFixture(BLOCKING_CHILD_SOURCE);
    let time = 0;

    await expect(
      waitForE2EServerReady({
        child,
        now: () => time,
        pollIntervalMillis: 5,
        probe: async () => false,
        timeoutMillis: 30,
        wait: async (milliseconds) => {
          time += milliseconds;
        },
      })
    ).rejects.toThrow(/timed out/i);
  });

  it("reports ready only after the probe succeeds while the child is alive", async () => {
    const child = spawnFixture(BLOCKING_CHILD_SOURCE);
    let probes = 0;

    await expect(
      waitForE2EServerReady({
        child,
        pollIntervalMillis: 1,
        probe: async () => {
          probes += 1;
          return probes === 2;
        },
        timeoutMillis: 1000,
        wait: async () => undefined,
      })
    ).resolves.toBeUndefined();
    expect(child.exitCode).toBeNull();
    expect(child.signalCode).toBeNull();
  });

  it("requires two stable rounds after an early failure and reload", async () => {
    const child = spawnFixture(BLOCKING_CHILD_SOURCE);
    const results = [false, true, false, true, true];
    let probes = 0;
    const readyAtProbe: number[] = [];

    await expect(
      waitForE2EServerReady({
        child,
        consecutiveSuccessfulProbes: 2,
        onReady: async () => {
          readyAtProbe.push(probes);
        },
        pollIntervalMillis: 1,
        probe: async () => results[probes++] ?? false,
        timeoutMillis: 1000,
        wait: async () => undefined,
      })
    ).resolves.toBeUndefined();
    expect(probes).toBe(5);
    expect(readyAtProbe).toEqual([5]);
  });

  it("allocates an available loopback target port", async () => {
    const port = await allocateE2EServerPort();

    expect(Number.isSafeInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65_535);
    await expect(
      probeE2EServerPort({
        deadlineMillis: Date.now() + 1000,
        port,
      })
    ).resolves.toBe(false);
  });

  it("opens canonical route probes only after the target accepts TCP", async () => {
    const port = await allocateE2EServerPort();
    const events: string[] = [];
    const onPortAccepted = vi.fn(() => {
      events.push("port");
    });
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      events.push("route");
      return new Response("ready", { status: 200 });
    });
    const probe = async (): Promise<boolean> =>
      await probeE2EServerTarget({
        appPort: port,
        appUrl: "https://darkfactory.localhost",
        deadlineMillis: Date.now() + 1000,
        onPortAccepted,
        fetchImplementation,
        onRequestStart: (path) => events.push(`request:${path}`),
        onResponse: (path, status) => events.push(`response:${path}:${status}`),
        onRequestError: (path, errorName) =>
          events.push(`error:${path}:${errorName}`),
      });

    await expect(probe()).resolves.toBe(false);
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(onPortAccepted).not.toHaveBeenCalled();
    expect(events).toEqual([]);

    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    try {
      const aborted = new AbortController();
      aborted.abort();
      await expect(
        probeE2EServerTarget({
          appPort: port,
          appUrl: "https://darkfactory.localhost",
          deadlineMillis: Date.now() + 1000,
          fetchImplementation,
          onPortAccepted,
          signal: aborted.signal,
        })
      ).resolves.toBe(false);
      await expect(
        probeE2EServerTarget({
          appPort: port,
          appUrl: "https://darkfactory.localhost",
          deadlineMillis: Date.now() - 1,
          fetchImplementation,
          onPortAccepted,
        })
      ).resolves.toBe(false);
      expect(fetchImplementation).not.toHaveBeenCalled();
      await expect(probe()).resolves.toBe(true);
      expect(fetchImplementation).toHaveBeenCalledTimes(3);
      expect(onPortAccepted).toHaveBeenCalledOnce();
      expect(events).toEqual([
        "port",
        "request:/",
        "route",
        "response:/:200",
        "request:/sign-in",
        "route",
        "response:/sign-in:200",
        "request:/api/auth/get-session",
        "route",
        "response:/api/auth/get-session:200",
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error)
        );
      });
    }
  });

  it("reports a sanitized route error class without changing readiness", async () => {
    const events: string[] = [];

    await expect(
      probeE2EServerRoutes({
        appUrl: "https://darkfactory.localhost",
        fetchImplementation: async () => {
          throw new TypeError("sensitive request detail");
        },
        onRequestError: (path, errorName) =>
          events.push(`error:${path}:${errorName}`),
        onRequestStart: (path) => events.push(`request:${path}`),
        onResponse: (path, status) => events.push(`response:${path}:${status}`),
      })
    ).resolves.toBe(false);
    expect(events).toEqual(["request:/", "error:/:TypeError"]);
  });

  it("holds journeys until two cold route rounds commit lifecycle readiness", async () => {
    vi.useFakeTimers();
    try {
      const child = Object.assign(new EventEmitter(), {
        exitCode: null,
        signalCode: null,
      }) as unknown as ChildProcess;
      const events: string[] = [];
      let lifecycleState: E2ELifecycleState = {
        version: 1,
        status: "starting",
        stage: "server-spawn",
      };
      const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
        const url = new URL(input.toString());
        if (url.pathname !== "/") {
          return new Response("ready", { status: 200 });
        }
        return await new Promise<Response>((resolve, reject) => {
          const timeout = setTimeout(() => {
            events.push("cold-route-response");
            resolve(new Response("ready", { status: 200 }));
          }, 40_000);
          init?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timeout);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true }
          );
        });
      });

      const readiness = waitForE2EServerReady({
        child,
        consecutiveSuccessfulProbes: 2,
        onReady: async () => {
          lifecycleState = {
            version: 1,
            status: "ready",
            stage: "server-ready",
          };
          events.push("readiness-committed");
        },
        probe: async ({ deadlineMillis }) =>
          await probeE2EServerRoutes({
            appUrl: "https://darkfactory.localhost",
            deadlineMillis,
            fetchImplementation,
          }),
      });
      const journey = waitForE2ELifecycleReady({
        readState: async () => lifecycleState,
      }).then(() => {
        events.push("journey-started");
      });

      await vi.advanceTimersByTimeAsync(79_999);
      expect(events).not.toContain("readiness-committed");
      expect(events).not.toContain("journey-started");
      await vi.advanceTimersByTimeAsync(1000);
      await expect(Promise.all([readiness, journey])).resolves.toEqual([
        undefined,
        undefined,
      ]);
      expect(events.slice(-2)).toEqual([
        "readiness-committed",
        "journey-started",
      ]);
      expect(
        classifyE2EServerExit({
          intentional: true,
          ready: lifecycleState.status === "ready",
          state: { exitCode: null, signal: "SIGTERM" },
        })
      ).toBe("stopped");
    } finally {
      vi.useRealTimers();
    }
  });

  it("commits readiness after a cold 200 without waiting for the response stream to end", async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess;
    let readiness: Promise<void> | undefined;
    try {
      const events: string[] = [];
      let lifecycleState: E2ELifecycleState = {
        version: 1,
        status: "starting",
        stage: "server-spawn",
      };
      let cold = true;
      const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
        const path = new URL(input.toString()).pathname;
        if (cold) {
          cold = false;
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 45_000);
          });
          events.push("http-200");
        }
        const body = new ReadableStream<Uint8Array>({
          cancel() {
            events.push(`body-cancelled:${path}`);
          },
          start(controller) {
            controller.enqueue(new TextEncoder().encode("ready"));
            init?.signal?.addEventListener(
              "abort",
              () => controller.error(new DOMException("Aborted", "AbortError")),
              { once: true }
            );
          },
        });
        return new Response(body, { status: 200 });
      });

      readiness = waitForE2EServerReady({
        child,
        consecutiveSuccessfulProbes: 2,
        onReady: async () => {
          lifecycleState = {
            version: 1,
            status: "ready",
            stage: "server-ready",
          };
          events.push("readiness-committed");
        },
        probe: async ({ deadlineMillis, signal }) =>
          await probeE2EServerRoutes({
            appUrl: "https://darkfactory.localhost",
            deadlineMillis,
            fetchImplementation,
            signal,
          }),
      });
      const journey = waitForE2ELifecycleReady({
        readState: async () => lifecycleState,
      }).then(() => {
        events.push("journey-started");
      });
      const convergence = Promise.race([
        Promise.all([readiness, journey]).then(() => "ready"),
        new Promise<"late">((resolve) => {
          setTimeout(() => resolve("late"), 46_000);
        }),
      ]);

      await vi.advanceTimersByTimeAsync(46_000);
      await expect(convergence).resolves.toBe("ready");
      expect(events[0]).toBe("http-200");
      expect(events.slice(-2)).toEqual([
        "readiness-committed",
        "journey-started",
      ]);
      const cancelledBodies = events.filter((event) =>
        event.startsWith("body-cancelled:")
      );
      expect(cancelledBodies).toHaveLength(6);
    } finally {
      child.emit("exit", 1, null);
      await readiness?.catch(() => undefined);
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("fails closed instead of releasing a journey from a terminal lifecycle state", async () => {
    await expect(
      waitForE2ELifecycleReady({
        readState: async () => ({
          version: 1,
          status: "startup-failed",
          stage: "server-spawn",
        }),
      })
    ).rejects.toThrow(/startup-failed\/server-spawn/i);
  });

  it("aborts an in-flight probe without a late readiness commit", async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess;
    const shutdown = new AbortController();
    const entered = createPromiseResolvers<void>();
    const onReady = vi.fn(async () => undefined);
    const readiness = waitForE2EServerReady({
      child,
      onReady,
      probe: async ({ signal }) =>
        await new Promise<boolean>((resolve) => {
          signal.addEventListener("abort", () => resolve(false), {
            once: true,
          });
          entered.resolve();
        }),
      signal: shutdown.signal,
    });

    await entered.promise;
    shutdown.abort();

    await expect(readiness).rejects.toThrow(/aborted/i);
    expect(onReady).not.toHaveBeenCalled();
  });

  it.each([
    ["deadline", /timed out/i],
    ["abort", /aborted/i],
    ["child-exit", /before readiness/i],
  ] as const)("joins a cancelled probe on %s before readiness teardown", async (interruption, expectedError) => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess;
    const shutdown = new AbortController();
    const entered = createPromiseResolvers<void>();
    const cancellationObserved = createPromiseResolvers<void>();
    const releaseProbe = createPromiseResolvers<void>();
    const observationPublished = vi.fn();
    try {
      const readiness = waitForE2EServerReady({
        child,
        pollIntervalMillis: 1,
        probe: async ({ signal }) => {
          entered.resolve();
          await new Promise<void>((resolve) => {
            const observeCancellation = () => {
              cancellationObserved.resolve();
              resolve();
            };
            if (signal.aborted) {
              observeCancellation();
              return;
            }
            signal.addEventListener("abort", observeCancellation, {
              once: true,
            });
          });
          await releaseProbe.promise;
          signal.throwIfAborted();
          observationPublished();
          return true;
        },
        signal: shutdown.signal,
        timeoutMillis: interruption === "deadline" ? 30 : 1000,
      });
      const readinessFailure = expect(readiness).rejects.toThrow(expectedError);
      let readinessSettled = false;
      const readinessSettlement = readiness.then(
        () => {
          readinessSettled = true;
        },
        () => {
          readinessSettled = true;
        }
      );

      await entered.promise;
      if (interruption === "deadline") {
        await vi.advanceTimersByTimeAsync(30);
      } else if (interruption === "abort") {
        shutdown.abort();
      } else {
        child.emit("exit", 1, null);
      }

      await cancellationObserved.promise;
      expect(readinessSettled).toBe(false);
      releaseProbe.resolve();
      await readinessFailure;
      await readinessSettlement;
      expect(observationPublished).not.toHaveBeenCalled();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it.each([
    ["deadline", /timed out/i],
    ["abort", /aborted/i],
    ["child-exit", /before readiness/i],
  ] as const)("cancels a pending readiness commit on %s without publishing ready", async (interruption, expectedError) => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess;
    const shutdown = new AbortController();
    const entered = createPromiseResolvers<void>();
    const cancellationObserved = createPromiseResolvers<void>();
    const releaseCommit = createPromiseResolvers<void>();
    const published = vi.fn();
    try {
      const readiness = waitForE2EServerReady({
        child,
        onReady: async (context?: E2EReadinessProbeContext) => {
          entered.resolve();
          if (context === undefined) {
            throw new Error("Readiness commit cancellation is unavailable.");
          }
          await new Promise<void>((resolve) => {
            const observeCancellation = () => {
              cancellationObserved.resolve();
              resolve();
            };
            if (context.signal.aborted) {
              observeCancellation();
              return;
            }
            context.signal.addEventListener("abort", observeCancellation, {
              once: true,
            });
          });
          await releaseCommit.promise;
          context.signal.throwIfAborted();
          published();
        },
        probe: async () => true,
        signal: shutdown.signal,
        pollIntervalMillis: 1,
        timeoutMillis: interruption === "deadline" ? 30 : 1000,
      });
      const readinessFailure = expect(readiness).rejects.toThrow(expectedError);
      let readinessSettled = false;
      const readinessSettlement = readiness.then(
        () => {
          readinessSettled = true;
        },
        () => {
          readinessSettled = true;
        }
      );

      await entered.promise;
      if (interruption === "deadline") {
        await vi.advanceTimersByTimeAsync(30);
      } else if (interruption === "abort") {
        shutdown.abort();
      } else {
        child.emit("exit", 1, null);
      }

      await cancellationObserved.promise;
      expect(readinessSettled).toBe(false);
      releaseCommit.resolve();
      await readinessFailure;
      await readinessSettlement;
      expect(published).not.toHaveBeenCalled();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("does not commit readiness when a first success is followed by failure and exit", async () => {
    const child = spawnFixture(BLOCKING_CHILD_SOURCE);
    const onReady = vi.fn(async () => undefined);
    let probes = 0;

    await expect(
      waitForE2EServerReady({
        child,
        consecutiveSuccessfulProbes: 2,
        onReady,
        pollIntervalMillis: 1,
        probe: async () => {
          probes += 1;
          if (probes === 1) {
            return true;
          }
          child.kill("SIGTERM");
          return false;
        },
        timeoutMillis: 1000,
      })
    ).rejects.toThrow(/before readiness/i);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("fails when route probes remain persistently unhealthy", async () => {
    const child = spawnFixture(BLOCKING_CHILD_SOURCE);
    let time = 0;

    await expect(
      waitForE2EServerReady({
        child,
        consecutiveSuccessfulProbes: 2,
        now: () => time,
        pollIntervalMillis: 5,
        probe: async () => false,
        timeoutMillis: 20,
        wait: async (milliseconds) => {
          time += milliseconds;
        },
      })
    ).rejects.toThrow(/timed out/i);
  });

  it("probes only exact anonymous same-origin GET routes", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async () => new Response("ready", { status: 200 })
    );

    await expect(
      probeE2EServerRoutes({
        appUrl: "https://darkfactory.localhost:1355",
        fetchImplementation,
      })
    ).resolves.toBe(true);
    expect(
      fetchImplementation.mock.calls.map(([input]) => input.toString())
    ).toEqual([
      "https://darkfactory.localhost:1355/",
      "https://darkfactory.localhost:1355/sign-in",
      "https://darkfactory.localhost:1355/api/auth/get-session",
    ]);
    for (const [, init] of fetchImplementation.mock.calls) {
      expect(init).toMatchObject({
        credentials: "omit",
        method: "GET",
        redirect: "manual",
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("does not wait for response body cancellation to settle", async () => {
    const cancellations: PromiseResolvers<void>[] = [];
    let cancellationInvocations = 0;
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      const cancellation = createPromiseResolvers<void>();
      const cancel = vi.fn(() => {
        cancellationInvocations += 1;
        return cancellation.promise;
      });
      cancellations.push(cancellation);
      return new Response(
        new ReadableStream<Uint8Array>({
          cancel,
          start(controller) {
            controller.enqueue(new TextEncoder().encode("ready"));
          },
        }),
        { status: 200 }
      );
    });
    const probe = probeE2EServerRoutes({
      appUrl: "https://darkfactory.localhost",
      fetchImplementation,
    });

    await expect(
      Promise.race([probe, yieldToChild().then(() => false)])
    ).resolves.toBe(true);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(cancellationInvocations).toBe(3);
    expect(cancellations).toHaveLength(3);
  });

  it("suppresses a late response body cancellation rejection", async () => {
    const cancellations: PromiseResolvers<void>[] = [];
    const unhandledRejections: unknown[] = [];
    const observeUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", observeUnhandledRejection);
    try {
      const fetchImplementation = vi.fn<typeof fetch>(async () => {
        const cancellation = createPromiseResolvers<void>();
        cancellations.push(cancellation);
        return new Response(
          new ReadableStream<Uint8Array>({
            cancel: () => cancellation.promise,
            start(controller) {
              controller.enqueue(new TextEncoder().encode("ready"));
            },
          }),
          { status: 200 }
        );
      });

      await expect(
        probeE2EServerRoutes({
          appUrl: "https://darkfactory.localhost",
          fetchImplementation,
        })
      ).resolves.toBe(true);
      expect(cancellations).toHaveLength(3);

      for (const cancellation of cancellations) {
        cancellation.reject(new Error("late cancellation failure"));
      }
      await yieldToChild();
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", observeUnhandledRejection);
    }
  });

  it("retains the configured standalone request timeout", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const fetchImplementation = vi.fn<typeof fetch>(
        async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true }
            );
          })
      );
      let settled = false;
      const probe = probeE2EServerRoutes({
        appUrl: "https://darkfactory.localhost",
        fetchImplementation,
        requestTimeoutMillis: 30_000,
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(29_999);
      expect(settled).toBe(false);
      expect(aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(probe).resolves.toBe(false);
      expect(aborted).toBe(true);
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets one deadline-driven cold route exceed the standalone request timeout", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      let requests = 0;
      const fetchImplementation = vi.fn<typeof fetch>(async (_input, init) => {
        requests += 1;
        if (requests > 1) {
          return new Response("ready", { status: 200 });
        }
        return await new Promise<Response>((resolve, reject) => {
          const response = setTimeout(
            () => resolve(new Response("ready", { status: 200 })),
            61_000
          );
          init?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              clearTimeout(response);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true }
          );
        });
      });
      let settled = false;
      const probe = probeE2EServerRoutes({
        appUrl: "https://darkfactory.localhost",
        deadlineMillis: Date.now() + 120_000,
        fetchImplementation,
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(60_000);
      expect(settled).toBe(false);
      expect(aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(3000);
      await expect(probe).resolves.toBe(true);
      expect(fetchImplementation).toHaveBeenCalledTimes(3);
      expect(aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts an in-flight cold route at the overall readiness deadline", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const fetchImplementation = vi.fn<typeof fetch>(
        async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true }
            );
          })
      );
      let settled = false;
      const probe = probeE2EServerRoutes({
        appUrl: "https://darkfactory.localhost",
        deadlineMillis: Date.now() + 30_000,
        fetchImplementation,
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(29_999);
      expect(settled).toBe(false);
      expect(aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(probe).resolves.toBe(false);
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects redirects, auth errors, missing routes, server errors, and declared oversized bodies", async () => {
    for (const status of [302, 401, 404, 500]) {
      const unhealthy = vi.fn<typeof fetch>(
        async () => new Response("not ready", { status })
      );
      await expect(
        probeE2EServerRoutes({
          appUrl: "https://darkfactory.localhost",
          fetchImplementation: unhealthy,
        })
      ).resolves.toBe(false);
      expect(unhealthy).toHaveBeenCalledTimes(1);
    }

    const oversized = vi.fn<typeof fetch>(
      async () =>
        new Response("too large", {
          headers: { "content-length": "1048577" },
          status: 200,
        })
    );
    await expect(
      probeE2EServerRoutes({
        appUrl: "https://darkfactory.localhost",
        fetchImplementation: oversized,
      })
    ).resolves.toBe(false);
    expect(oversized).toHaveBeenCalledTimes(1);
  });

  it("cancels rejected streaming responses before a later healthy probe", async () => {
    const streamingResponse = (status: number, headers?: HeadersInit) => {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        cancel,
        start(controller) {
          controller.enqueue(new TextEncoder().encode("12345"));
        },
      });
      return {
        cancel,
        response: new Response(body, {
          ...(headers === undefined ? {} : { headers }),
          status,
        }),
      };
    };

    const non200 = streamingResponse(500);
    await expect(
      probeE2EServerRoutes({
        appUrl: "https://darkfactory.localhost",
        fetchImplementation: vi.fn<typeof fetch>(async () => non200.response),
      })
    ).resolves.toBe(false);
    expect(non200.cancel).toHaveBeenCalledTimes(1);

    const declaredOversize = streamingResponse(200, {
      "content-length": "1048577",
    });
    await expect(
      probeE2EServerRoutes({
        appUrl: "https://darkfactory.localhost",
        fetchImplementation: vi.fn<typeof fetch>(
          async () => declaredOversize.response
        ),
      })
    ).resolves.toBe(false);
    expect(declaredOversize.cancel).toHaveBeenCalledTimes(1);

    await expect(
      probeE2EServerRoutes({
        appUrl: "https://darkfactory.localhost",
        fetchImplementation: vi.fn<typeof fetch>(
          async () => new Response("ready", { status: 200 })
        ),
      })
    ).resolves.toBe(true);
  });

  it("classifies a real unexpected post-readiness exit as runtime failure", async () => {
    const child = spawnFixture(BLOCKING_CHILD_SOURCE);
    await waitForE2EServerReady({
      child,
      probe: async () => true,
      timeoutMillis: 1000,
    });
    child.kill("SIGTERM");
    const state = await waitForExit(child);

    expect(
      classifyE2EServerExit({ intentional: false, ready: true, state })
    ).toBe("runtime-failed");
  });

  it("classifies an intentional clean stop separately from runtime failure", async () => {
    const child = spawnFixture(BLOCKING_CHILD_SOURCE);
    await waitForE2EServerReady({
      child,
      probe: async () => true,
      timeoutMillis: 1000,
    });
    child.kill("SIGTERM");
    const state = await waitForExit(child);

    expect(
      classifyE2EServerExit({ intentional: true, ready: true, state })
    ).toBe("stopped");
  });
});
