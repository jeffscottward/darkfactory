import { spawn, type ChildProcess } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyE2EServerExit,
  createPromiseResolvers,
  probeE2EServerRoutes,
  waitForE2EServerReady,
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

  it("rejects redirects, auth errors, missing routes, server errors, and oversized bodies", async () => {
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

    const streamedOversize = vi.fn<typeof fetch>(
      async () => new Response("12345", { status: 200 })
    );
    await expect(
      probeE2EServerRoutes({
        appUrl: "https://darkfactory.localhost",
        fetchImplementation: streamedOversize,
        maxBodyBytes: 4,
      })
    ).resolves.toBe(false);
    expect(streamedOversize).toHaveBeenCalledTimes(1);
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

    const chunkedOversize = streamingResponse(200);
    await expect(
      probeE2EServerRoutes({
        appUrl: "https://darkfactory.localhost",
        fetchImplementation: vi.fn<typeof fetch>(
          async () => chunkedOversize.response
        ),
        maxBodyBytes: 4,
      })
    ).resolves.toBe(false);
    expect(chunkedOversize.cancel).toHaveBeenCalledTimes(1);

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
