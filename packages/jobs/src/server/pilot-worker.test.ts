import type {
  DatabaseResource,
  WorkflowRepository,
} from "@darkfactory/db/server";
import { parseWorkflowRepositoryGrants } from "@darkfactory/state/workflow";
import { describe, expect, it, vi } from "vitest";
import {
  OMP_VERIFIER_COMMAND_IDENTITY,
  type OmpCliAdapter,
  OmpProcessTerminationError,
} from "./omp.ts";
import {
  createPilotPollingWorker,
  createPilotWorker,
  type PilotPollingWorker,
  type PilotSignalSource,
  PilotWorkerConfigurationError,
  type PilotWorkerDependencies,
  parsePilotWorkerEnvironment,
  runPilotWorker,
} from "./pilot-worker.ts";
import type { WayfinderExecutionPort } from "./wayfinder.ts";
import type { WorkflowRuntime } from "./workflow-runtime.ts";

const VERIFIER_IMAGE_DIGEST = `sha256:${"a".repeat(64)}`;

const configuration = {
  connectionString: "postgresql://localhost/darkfactory",
  repositoriesRoot: "/srv/repositories",
  leaseOwner: "pilot-test",
  pollIntervalMs: 60_000,
  shutdownTimeoutMs: 1000,
  repositoryGrants: parseWorkflowRepositoryGrants("owner-1=darkfactory"),
  verifierId: OMP_VERIFIER_COMMAND_IDENTITY,
  verifierImageDigest: VERIFIER_IMAGE_DIGEST,
} as const;

describe("pilot workflow worker", () => {
  it("loads bounded database and polling configuration", () => {
    expect(
      parsePilotWorkerEnvironment({
        DATABASE_URL: "postgresql://localhost/darkfactory",
        WORKFLOW_REPOSITORIES_ROOT: "/srv/repositories",
        WORKFLOW_LEASE_OWNER: "pilot-test",
        WORKFLOW_POLL_INTERVAL_MS: "250",
        WORKFLOW_SHUTDOWN_TIMEOUT_MS: "5000",
        WORKFLOW_REPOSITORY_GRANTS: "owner-1=darkfactory",
        WORKFLOW_VERIFIER_ID: OMP_VERIFIER_COMMAND_IDENTITY,
        WORKFLOW_VERIFIER_IMAGE_DIGEST: VERIFIER_IMAGE_DIGEST,
      })
    ).toEqual({
      ...configuration,
      pollIntervalMs: 250,
      shutdownTimeoutMs: 5000,
    });
    expect(() =>
      parsePilotWorkerEnvironment({
        DATABASE_URL: "https://database.example/darkfactory",
        WORKFLOW_REPOSITORIES_ROOT: "/srv/repositories",
      })
    ).toThrow("DATABASE_URL must be a PostgreSQL URL");
    expect(() =>
      parsePilotWorkerEnvironment({
        DATABASE_URL: "postgresql://localhost/darkfactory",
        WORKFLOW_REPOSITORIES_ROOT: "../repositories",
      })
    ).toThrow("WORKFLOW_REPOSITORIES_ROOT must be an absolute path");
    return expect(() =>
      parsePilotWorkerEnvironment({
        DATABASE_URL: "postgresql://localhost/darkfactory",
        WORKFLOW_REPOSITORIES_ROOT: "/srv/repositories",
      })
    ).toThrow("WORKFLOW_REPOSITORY_GRANTS is invalid");
  });

  it("polls sequentially and closes exactly once across repeated stops", async () => {
    const runOnce = vi.fn(async () => []);
    const close = vi.fn(async () => undefined);
    const stopRuntime = vi.fn(async () => undefined);
    const worker = createPilotPollingWorker({
      runOnce,
      close,
      stopRuntime,
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 1000,
    });
    const running = worker.start();
    await vi.waitFor(() => expect(runOnce).toHaveBeenCalledOnce());
    await Promise.all([worker.stop(), worker.stop(), running]);
    return expect(close).toHaveBeenCalledOnce();
  });

  it("settles the active runtime before closing the database", async () => {
    const ordering: string[] = [];
    let databaseClosed = false;
    let finishRun: (() => void) | undefined;
    const runOnce = vi.fn(
      () =>
        new Promise<readonly unknown[]>((resolve) => {
          return (finishRun = () => {
            expect(databaseClosed).toBe(false);
            ordering.push("run-settled");
            return resolve([]);
          });
        })
    );
    const stopRuntime = vi.fn(async () => {
      ordering.push("runtime-stop-start");
      finishRun?.();
      await Promise.resolve();
      ordering.push("runtime-stop-settled");
      return;
    });
    const close = vi.fn(async () => {
      databaseClosed = true;
      ordering.push("database-close");
      return;
    });
    const worker = createPilotPollingWorker({
      runOnce,
      stopRuntime,
      close,
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 100,
    });

    const running = worker.start();
    await vi.waitFor(() => expect(runOnce).toHaveBeenCalledOnce());
    await Promise.all([worker.stop(), worker.stop(), running]);

    expect(stopRuntime).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    return expect(ordering).toEqual([
      "runtime-stop-start",
      "run-settled",
      "runtime-stop-settled",
      "database-close",
    ]);
  });

  it("bounds runtime shutdown and still attempts database close", async () => {
    const close = vi.fn(async () => undefined);
    const stopRuntime = vi.fn(() => new Promise<void>(() => undefined));
    const worker = createPilotPollingWorker({
      runOnce: vi.fn(async () => []),
      stopRuntime,
      close,
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 100,
    });
    const running = worker.start();
    await Promise.resolve();

    const stopResults = await Promise.allSettled([worker.stop(), running]);
    const stopped = stopResults[0]!;
    const loopResult = stopResults[1]!;

    expect(stopped).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        message: "Pilot shutdown deadline exceeded",
      }),
    });
    expect(loopResult).toMatchObject({ status: "rejected" });
    expect(stopRuntime).toHaveBeenCalledOnce();
    return expect(close).toHaveBeenCalledOnce();
  });
  it("bounds hanging runtime and database cleanup within one total deadline", async () => {
    const close = vi.fn(() => new Promise<void>(() => undefined));
    const worker = createPilotPollingWorker({
      runOnce: vi.fn(async () => []),
      stopRuntime: vi.fn(() => new Promise<void>(() => undefined)),
      close,
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 100,
    });
    const startedAt = Date.now();
    const rejection = await worker.stop().catch((error: unknown) => error);
    const elapsed = Date.now() - startedAt;
    expect(rejection).toBeInstanceOf(AggregateError);
    expect(close).toHaveBeenCalledOnce();
    expect(elapsed).toBeGreaterThanOrEqual(90);
    return expect(elapsed).toBeLessThan(200);
  });
  it("ignores a runtime settlement that arrives after the shutdown deadline", async () => {
    let finishRuntime: (() => void) | undefined;
    const close = vi.fn(async () => undefined);
    const worker = createPilotPollingWorker({
      runOnce: vi.fn(async () => []),
      stopRuntime: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            return (finishRuntime = resolve);
          })
      ),
      close,
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 100,
    });

    await expect(worker.stop()).rejects.toThrow(
      "Pilot shutdown deadline exceeded"
    );
    finishRuntime?.();
    await Promise.resolve();
    return expect(close).toHaveBeenCalledOnce();
  });
  it("ignores timeout callbacks and operation rejections after shutdown has settled", async () => {
    vi.useFakeTimers();
    const clearTimeout = vi
      .spyOn(globalThis, "clearTimeout")
      .mockImplementation(() => undefined);
    try {
      const settled = createPilotPollingWorker({
        runOnce: vi.fn(async () => []),
        stopRuntime: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        pollIntervalMs: 60_000,
        shutdownTimeoutMs: 100,
      });
      await settled.stop();
      await vi.advanceTimersByTimeAsync(100);

      let rejectRuntime: ((error: Error) => void) | undefined;
      const timedOut = createPilotPollingWorker({
        runOnce: vi.fn(async () => []),
        stopRuntime: vi.fn(
          () =>
            new Promise<void>((_resolve, reject) => {
              return (rejectRuntime = reject);
            })
        ),
        close: vi.fn(async () => undefined),
        pollIntervalMs: 60_000,
        shutdownTimeoutMs: 100,
      });
      const stopping = expect(timedOut.stop()).rejects.toThrow(
        "Pilot shutdown deadline exceeded"
      );
      await vi.advanceTimersByTimeAsync(100);
      await stopping;
      rejectRuntime?.(new Error("late runtime rejection"));
      return await Promise.resolve();
    } finally {
      vi.clearAllTimers();
      clearTimeout.mockRestore();
      vi.useRealTimers();
    }
  });

  it("closes the database after an ordinary settled runtime-stop failure", async () => {
    const close = vi.fn(async () => undefined);
    const stopRuntime = vi.fn(async () => {
      throw new Error("runtime stop failed");
    });
    const worker = createPilotPollingWorker({
      runOnce: vi.fn(async () => []),
      stopRuntime,
      close,
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 100,
    });
    const running = worker.start();
    await Promise.resolve();

    const stopResults = await Promise.allSettled([worker.stop(), running]);
    const stopped = stopResults[0]!;
    const loopResult = stopResults[1]!;

    expect(stopped).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "runtime stop failed" }),
    });
    expect(loopResult).toMatchObject({ status: "rejected" });
    return expect(close).toHaveBeenCalledOnce();
  });

  it("composes the database, repository, OMP adapter, and runtime", async () => {
    const close = vi.fn(async () => undefined);
    const database = { db: {} as DatabaseResource["db"], close };
    const repository = {} as WorkflowRepository;
    const adapter = {} as OmpCliAdapter;
    const wayfinderAdapter = {} as WayfinderExecutionPort;
    const runOnce = vi.fn(async () => []);
    const stopRuntime = vi.fn(async () => undefined);
    const runtime = {
      application: {},
      runOnce,
      stop: stopRuntime,
    } as unknown as WorkflowRuntime;
    const createDatabase = vi.fn(() => database);
    const createRepository = vi.fn(() => repository);
    const createAdapter = vi.fn(() => adapter);
    const createWayfinderAdapter = vi.fn(() => wayfinderAdapter);
    const createRuntime = vi.fn(
      (_input: Parameters<PilotWorkerDependencies["createRuntime"]>[0]) =>
        runtime
    );

    const worker = await createPilotWorker(configuration, {
      createDatabase,
      createRepository,
      createAdapter,
      createWayfinderAdapter,
      createRuntime,
    });
    const running = worker.start();
    await vi.waitFor(() => expect(runOnce).toHaveBeenCalledOnce());
    await worker.stop();
    await running;

    expect(createDatabase).toHaveBeenCalledWith(configuration.connectionString);
    expect(createRepository).toHaveBeenCalledWith(database.db);
    expect(createAdapter).toHaveBeenCalledWith(
      configuration.repositoriesRoot,
      Math.floor(configuration.shutdownTimeoutMs / 2),
      configuration.verifierId,
      configuration.verifierImageDigest
    );
    expect(createWayfinderAdapter).toHaveBeenCalledWith({
      omp: adapter,
      repositoriesRoot: configuration.repositoriesRoot,
    });
    expect(createRuntime).toHaveBeenCalledWith({
      repository,
      adapter,
      wayfinderAdapter,
      leaseOwner: configuration.leaseOwner,
      authorizeRepository: expect.any(Function),
    });
    const authorizeRepository =
      createRuntime.mock.calls[0]![0].authorizeRepository;
    expect(authorizeRepository("owner-1", "darkfactory")).toBe(true);
    expect(authorizeRepository("owner-2", "darkfactory")).toBe(false);
    expect(close).toHaveBeenCalledOnce();
    return expect(stopRuntime).toHaveBeenCalledOnce();
  });

  it("handles SIGTERM and unregisters both process listeners", async () => {
    const listeners = new Map<string, () => void>();
    let finish: (() => void) | undefined;
    const worker = {
      start: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
      stop: vi.fn(async () => finish?.()),
    } satisfies PilotPollingWorker;
    const signals = {
      on: vi.fn((signal: string, listener: () => void) =>
        listeners.set(signal, listener)
      ),
      off: vi.fn((signal: string) => listeners.delete(signal)),
    } as unknown as PilotSignalSource;

    const running = runPilotWorker(worker, signals);
    await vi.waitFor(() => expect(listeners.has("SIGTERM")).toBe(true));
    listeners.get("SIGTERM")?.();
    await running;

    expect(signals.off).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    return expect(signals.off).toHaveBeenCalledWith(
      "SIGTERM",
      expect.any(Function)
    );
  });
  it("rejects missing and malformed environment boundaries", () => {
    const valid = {
      DATABASE_URL: "postgresql://localhost/darkfactory",
      WORKFLOW_REPOSITORIES_ROOT: "/srv/repositories",
      WORKFLOW_REPOSITORY_GRANTS: "owner-1=darkfactory",
      WORKFLOW_VERIFIER_ID: OMP_VERIFIER_COMMAND_IDENTITY,
      WORKFLOW_VERIFIER_IMAGE_DIGEST: VERIFIER_IMAGE_DIGEST,
    };
    for (const environment of [
      { ...valid, DATABASE_URL: undefined },
      { ...valid, DATABASE_URL: "not a URL" },
      { ...valid, DATABASE_URL: "postgresql:///darkfactory" },
      { ...valid, WORKFLOW_REPOSITORIES_ROOT: undefined },
      { ...valid, WORKFLOW_REPOSITORIES_ROOT: "" },
      { ...valid, WORKFLOW_REPOSITORIES_ROOT: "/srv/repositories\0escape" },
      { ...valid, WORKFLOW_VERIFIER_ID: undefined },
      { ...valid, WORKFLOW_VERIFIER_ID: "arbitrary-command" },
      { ...valid, WORKFLOW_VERIFIER_IMAGE_DIGEST: undefined },
      {
        ...valid,
        WORKFLOW_VERIFIER_IMAGE_DIGEST: "darkfactory-verifier:latest",
      },
      { ...valid, WORKFLOW_LEASE_OWNER: "unsafe owner" },
      { ...valid, WORKFLOW_POLL_INTERVAL_MS: "0" },
      { ...valid, WORKFLOW_POLL_INTERVAL_MS: "60001" },
      { ...valid, WORKFLOW_POLL_INTERVAL_MS: "1.5" },
      { ...valid, WORKFLOW_SHUTDOWN_TIMEOUT_MS: "99" },
    ]) {
      expect(() => parsePilotWorkerEnvironment(environment)).toThrow(
        PilotWorkerConfigurationError
      );
    }

    const defaults = parsePilotWorkerEnvironment(valid);
    expect(defaults).toMatchObject({
      pollIntervalMs: 1000,
      shutdownTimeoutMs: 10_000,
    });
    expect(defaults.leaseOwner).toBe(`pilot-${process.pid}`);
    return expect(
      parsePilotWorkerEnvironment({
        ...valid,
        DATABASE_URL: "postgres://localhost/darkfactory",
      }).connectionString
    ).toBe("postgres://localhost/darkfactory");
  });

  it("rejects invalid polling shutdown deadlines", () => {
    const results = [];
    for (const shutdownTimeoutMs of [0, 99, 60_001, Number.NaN]) {
      results.push(
        expect(() =>
          createPilotPollingWorker({
            runOnce: vi.fn(async () => []),
            stopRuntime: vi.fn(async () => undefined),
            close: vi.fn(async () => undefined),
            pollIntervalMs: 1,
            shutdownTimeoutMs,
          })
        ).toThrow(PilotWorkerConfigurationError)
      );
    }
    return results;
  });

  it("starts once, wakes a pending poll, and supports stopping before start", async () => {
    const stopRuntime = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const worker = createPilotPollingWorker({
      runOnce: vi.fn(async () => []),
      stopRuntime,
      close,
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 100,
    });
    const first = worker.start();
    const second = worker.start();
    expect(second).toBe(first);
    await worker.stop();
    await first;
    expect(stopRuntime).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();

    const neverStartedClose = vi.fn(async () => undefined);
    const neverStarted = createPilotPollingWorker({
      runOnce: vi.fn(async () => []),
      stopRuntime: vi.fn(async () => undefined),
      close: neverStartedClose,
      pollIntervalMs: 1,
      shutdownTimeoutMs: 100,
    });
    await neverStarted.stop();
    return expect(neverStartedClose).toHaveBeenCalledOnce();
  });

  it("preserves process termination failures and aggregates runtime and close failures", async () => {
    const processError = new OmpProcessTerminationError();
    const closeAfterTermination = vi.fn(async () => undefined);
    const terminated = createPilotPollingWorker({
      runOnce: vi.fn(async () => []),
      stopRuntime: vi.fn(async () => {
        throw processError;
      }),
      close: closeAfterTermination,
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 100,
    });
    await expect(terminated.stop()).rejects.toBe(processError);
    expect(closeAfterTermination).toHaveBeenCalledOnce();

    const runtimeError = new Error("runtime cleanup failed");
    const closeError = new Error("database cleanup failed");
    const aggregate = createPilotPollingWorker({
      runOnce: vi.fn(async () => []),
      stopRuntime: vi.fn(async () => {
        throw runtimeError;
      }),
      close: vi.fn(async () => {
        throw closeError;
      }),
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 100,
    });
    const rejection = await aggregate.stop().catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(AggregateError);
    return expect((rejection as AggregateError).errors).toEqual([
      runtimeError,
      closeError,
    ]);
  });

  it("applies one shutdown deadline to database close after runtime settlement", async () => {
    const worker = createPilotPollingWorker({
      runOnce: vi.fn(async () => []),
      stopRuntime: vi.fn(async () => undefined),
      close: vi.fn(() => new Promise<void>(() => undefined)),
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 100,
    });
    return await expect(worker.stop()).rejects.toThrow(
      "Pilot database close deadline exceeded"
    );
  });

  it("starts an independent database close after the runtime deadline is spent", async () => {
    let clock = 1000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => clock);
    const close = vi.fn(async () => undefined);
    const worker = createPilotPollingWorker({
      runOnce: vi.fn(async () => []),
      stopRuntime: vi.fn(async () => {
        clock = 1101;
        return;
      }),
      close,
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 100,
    });
    try {
      await expect(worker.stop()).resolves.toBeUndefined();
      return expect(close).toHaveBeenCalledOnce();
    } finally {
      dateNow.mockRestore();
    }
  });

  it("cleans up runtime and database when polling rejects", async () => {
    const pollError = new Error("poll unavailable");
    const stopRuntime = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const worker = createPilotPollingWorker({
      runOnce: vi.fn(async () => {
        throw pollError;
      }),
      stopRuntime,
      close,
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 100,
    });

    await expect(worker.start()).rejects.toBe(pollError);
    expect(stopRuntime).toHaveBeenCalledOnce();
    return expect(close).toHaveBeenCalledOnce();
  });

  it("closes an allocated database when worker composition fails", async () => {
    const close = vi.fn(async () => undefined);
    const compositionError = new Error("repository unavailable");
    await expect(
      createPilotWorker(configuration, {
        createDatabase: vi.fn(() => ({
          db: {} as DatabaseResource["db"],
          close,
        })),
        createRepository: vi.fn(() => {
          throw compositionError;
        }),
        createAdapter: vi.fn(),
        createWayfinderAdapter: vi.fn(),
        createRuntime: vi.fn(),
      })
    ).rejects.toBe(compositionError);
    return expect(close).toHaveBeenCalledOnce();
  });
  it("closes composition when the derived process timeout reaches its minimum", async () => {
    const close = vi.fn(async () => undefined);
    const createAdapter = vi.fn(() => ({}) as OmpCliAdapter);
    await expect(
      createPilotWorker(
        {
          ...configuration,
          shutdownTimeoutMs: 1,
        },
        {
          createDatabase: vi.fn(() => ({
            db: {} as DatabaseResource["db"],
            close,
          })),
          createRepository: vi.fn(() => ({}) as WorkflowRepository),
          createAdapter,
          createWayfinderAdapter: vi.fn(() => ({}) as WayfinderExecutionPort),
          createRuntime: vi.fn(
            () =>
              ({
                application: {},
                runOnce: vi.fn(async () => []),
                stop: vi.fn(async () => undefined),
              }) as unknown as WorkflowRuntime
          ),
        }
      )
    ).rejects.toBeInstanceOf(PilotWorkerConfigurationError);
    expect(createAdapter).toHaveBeenCalledWith(
      configuration.repositoriesRoot,
      1,
      configuration.verifierId,
      configuration.verifierImageDigest
    );
    return expect(close).toHaveBeenCalledOnce();
  });

  it("waits for the poll timer before running the next sequential batch", async () => {
    let finishSecond: (() => void) | undefined;
    const runOnce = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockImplementationOnce(
        () =>
          new Promise<readonly unknown[]>((resolve) => {
            return (finishSecond = () => resolve([]));
          })
      );
    const worker = createPilotPollingWorker({
      runOnce,
      stopRuntime: vi.fn(async () => finishSecond?.()),
      close: vi.fn(async () => undefined),
      pollIntervalMs: 1,
      shutdownTimeoutMs: 100,
    });
    const running = worker.start();
    await vi.waitFor(() => expect(runOnce).toHaveBeenCalledTimes(2));
    await worker.stop();
    await running;
    return expect(runOnce).toHaveBeenCalledTimes(2);
  });

  return it("removes signal listeners and still stops when start rejects or signal stop rejects", async () => {
    const listeners = new Map<string, () => void>();
    const signals = {
      on: vi.fn((signal: string, listener: () => void) =>
        listeners.set(signal, listener)
      ),
      off: vi.fn((signal: string) => listeners.delete(signal)),
    } as unknown as PilotSignalSource;
    const startError = new Error("poll failed");
    let rejectStart: ((error: Error) => void) | undefined;
    const worker = {
      start: vi.fn(
        () => new Promise<void>((_resolve, reject) => (rejectStart = reject))
      ),
      stop: vi
        .fn()
        .mockRejectedValueOnce(new Error("signal stop failed"))
        .mockResolvedValueOnce(undefined),
    } satisfies PilotPollingWorker;

    const running = runPilotWorker(worker, signals);
    await vi.waitFor(() => expect(listeners.has("SIGINT")).toBe(true));
    listeners.get("SIGINT")?.();
    rejectStart?.(startError);
    await expect(running).rejects.toBe(startError);
    expect(worker.stop).toHaveBeenCalledTimes(2);
    return expect(signals.off).toHaveBeenCalledTimes(2);
  });
});
