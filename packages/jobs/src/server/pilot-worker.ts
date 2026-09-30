import { isAbsolute } from "node:path";

import {
  createNodeDatabase,
  type Database,
  type DatabaseResource,
} from "@darkfactory/db/server";
import {
  isWorkflowRepositoryGranted,
  parseWorkflowRepositoryGrants,
} from "../workflow/index.ts";

import {
  createOmpCliAdapter,
  OMP_VERIFIER_COMMAND_IDENTITY,
  type OmpApprovedVerifierId,
  type OmpCliAdapter,
} from "./omp.ts";
import {
  createLocalWayfinderExecutionAdapter,
  type WayfinderExecutionPort,
} from "./wayfinder.ts";
import {
  createWorkflowRepository,
  type WorkflowRepository,
} from "./workflow-repository.ts";
import {
  createWorkflowRuntime,
  type WorkflowRuntime,
} from "./workflow-runtime.ts";

export const DEFAULT_PILOT_POLL_INTERVAL_MS = 1000;
export const DEFAULT_PILOT_SHUTDOWN_TIMEOUT_MS = 10_000;
const MAX_PILOT_INTERVAL_MS = 60_000;
const MIN_PILOT_SHUTDOWN_TIMEOUT_MS = 100;
const LEASE_OWNER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const VERIFIER_IMAGE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

export type PilotWorkerConfiguration = Readonly<{
  connectionString: string;
  repositoriesRoot: string;
  leaseOwner: string;
  pollIntervalMs: number;
  shutdownTimeoutMs: number;
  verifierId: OmpApprovedVerifierId;
  verifierImageDigest: string;
  repositoryGrants: ReturnType<typeof parseWorkflowRepositoryGrants>;
}>;

export class PilotWorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PilotWorkerConfigurationError";
  }
}

class PilotShutdownDeadlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PilotShutdownDeadlineError";
  }
}

const boundedInteger = (
  value: string | undefined,
  fallback: number,
  name: string
): number => {
  // An empty value, as `.env.example` ships it, means "use the default".
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    parsed > MAX_PILOT_INTERVAL_MS
  ) {
    throw new PilotWorkerConfigurationError(
      `${name} must be a positive bounded integer`
    );
  }
  return parsed;
};

const boundedShutdownTimeout = (value: string | undefined): number => {
  const timeout = boundedInteger(
    value,
    DEFAULT_PILOT_SHUTDOWN_TIMEOUT_MS,
    "WORKFLOW_SHUTDOWN_TIMEOUT_MS"
  );
  if (timeout < MIN_PILOT_SHUTDOWN_TIMEOUT_MS) {
    throw new PilotWorkerConfigurationError(
      `WORKFLOW_SHUTDOWN_TIMEOUT_MS must be at least ${MIN_PILOT_SHUTDOWN_TIMEOUT_MS}`
    );
  }
  return timeout;
};

export const parsePilotWorkerEnvironment = (
  source: NodeJS.ProcessEnv
): PilotWorkerConfiguration => {
  const connectionString = source["DATABASE_URL"]?.trim();
  if (connectionString === undefined || connectionString.length === 0) {
    throw new PilotWorkerConfigurationError("DATABASE_URL is required");
  }
  try {
    const parsed = new URL(connectionString);
    if (
      (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
      parsed.hostname.length === 0
    ) {
      throw new PilotWorkerConfigurationError(
        "DATABASE_URL must be a PostgreSQL URL"
      );
    }
  } catch (error) {
    if (error instanceof PilotWorkerConfigurationError) throw error;
    throw new PilotWorkerConfigurationError(
      "DATABASE_URL must be a PostgreSQL URL"
    );
  }

  const repositoriesRoot = source["WORKFLOW_REPOSITORIES_ROOT"]?.trim();
  if (
    repositoriesRoot === undefined ||
    repositoriesRoot.length === 0 ||
    repositoriesRoot.includes("\0") ||
    !isAbsolute(repositoriesRoot)
  ) {
    throw new PilotWorkerConfigurationError(
      "WORKFLOW_REPOSITORIES_ROOT must be an absolute path"
    );
  }

  const configuredLeaseOwner = source["WORKFLOW_LEASE_OWNER"]?.trim();
  const leaseOwner =
    configuredLeaseOwner === undefined || configuredLeaseOwner === ""
      ? `pilot-${process.pid}`
      : configuredLeaseOwner;
  if (!LEASE_OWNER_PATTERN.test(leaseOwner)) {
    throw new PilotWorkerConfigurationError("WORKFLOW_LEASE_OWNER is invalid");
  }

  let repositoryGrants: ReturnType<typeof parseWorkflowRepositoryGrants>;
  try {
    repositoryGrants = parseWorkflowRepositoryGrants(
      source["WORKFLOW_REPOSITORY_GRANTS"]
    );
  } catch {
    throw new PilotWorkerConfigurationError(
      "WORKFLOW_REPOSITORY_GRANTS is invalid"
    );
  }
  const verifierId = source["WORKFLOW_VERIFIER_ID"]?.trim();
  if (verifierId !== OMP_VERIFIER_COMMAND_IDENTITY) {
    throw new PilotWorkerConfigurationError(
      "WORKFLOW_VERIFIER_ID must select the approved verifier"
    );
  }
  const verifierImageDigest = source["WORKFLOW_VERIFIER_IMAGE_DIGEST"]?.trim();
  if (
    verifierImageDigest === undefined ||
    !VERIFIER_IMAGE_DIGEST_PATTERN.test(verifierImageDigest)
  ) {
    throw new PilotWorkerConfigurationError(
      "WORKFLOW_VERIFIER_IMAGE_DIGEST must be a pinned sha256 digest"
    );
  }

  return Object.freeze({
    connectionString,
    repositoriesRoot,
    leaseOwner,
    repositoryGrants,
    verifierId,
    verifierImageDigest,
    pollIntervalMs: boundedInteger(
      source["WORKFLOW_POLL_INTERVAL_MS"],
      DEFAULT_PILOT_POLL_INTERVAL_MS,
      "WORKFLOW_POLL_INTERVAL_MS"
    ),
    shutdownTimeoutMs: boundedShutdownTimeout(
      source["WORKFLOW_SHUTDOWN_TIMEOUT_MS"]
    ),
  });
};

export type PilotPollingWorker = Readonly<{
  start: () => Promise<void>;
  stop: () => Promise<void>;
}>;

export type PilotPollingWorkerOptions = Readonly<{
  runOnce: () => Promise<readonly unknown[]>;
  stopRuntime: () => Promise<void>;
  close: () => Promise<void>;
  pollIntervalMs: number;
  shutdownTimeoutMs: number;
}>;

export const createPilotPollingWorker = (
  options: PilotPollingWorkerOptions
): PilotPollingWorker => {
  if (
    !Number.isSafeInteger(options.shutdownTimeoutMs) ||
    options.shutdownTimeoutMs < MIN_PILOT_SHUTDOWN_TIMEOUT_MS ||
    options.shutdownTimeoutMs > MAX_PILOT_INTERVAL_MS
  ) {
    throw new PilotWorkerConfigurationError(
      "shutdownTimeoutMs must be a positive bounded integer"
    );
  }
  let stopping = false;
  let loopPromise: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let stoppingPromise: Promise<void> | undefined;
  let wakePoll: (() => void) | undefined;
  let runtimeStopping: Promise<void> | undefined;
  let shutdownFinishing: Promise<void> | undefined;
  let shutdownDeadline: number | undefined;

  const runWithTimeout = (
    operation: () => Promise<void>,
    milliseconds: number,
    timeoutMessage: string
  ): Promise<void> =>
    new Promise<void>((resolveOperation, rejectOperation) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        return rejectOperation(new PilotShutdownDeadlineError(timeoutMessage));
      }, milliseconds);
      return void Promise.resolve()
        .then(operation)
        .then(
          () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            return resolveOperation();
          },
          (error: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            return rejectOperation(error);
          }
        );
    });

  const remainingShutdownMilliseconds = (): number => {
    shutdownDeadline ??= Date.now() + options.shutdownTimeoutMs;
    return Math.max(1, shutdownDeadline - Date.now());
  };

  const closeOnce = (): Promise<void> => {
    closing ??= runWithTimeout(
      options.close,
      remainingShutdownMilliseconds(),
      "Pilot database close deadline exceeded"
    );
    return closing;
  };

  const stopRuntimeOnce = (): Promise<void> => {
    runtimeStopping ??= runWithTimeout(
      options.stopRuntime,
      Math.max(1, Math.floor(remainingShutdownMilliseconds() / 2)),
      "Pilot shutdown deadline exceeded"
    );
    return runtimeStopping;
  };

  const finishShutdownOnce = (): Promise<void> => {
    shutdownFinishing ??= (async () => {
      let runtimeError: unknown;
      let closeError: unknown;
      try {
        await stopRuntimeOnce();
      } catch (error) {
        runtimeError = error;
      }
      try {
        await closeOnce();
      } catch (error) {
        closeError = error;
      }
      if (runtimeError !== undefined && closeError !== undefined) {
        throw new AggregateError(
          [runtimeError, closeError],
          "Pilot runtime and database cleanup failed"
        );
      }
      if (runtimeError !== undefined) throw runtimeError;
      if (closeError !== undefined) throw closeError;
      return;
    })();
    return shutdownFinishing;
  };

  const waitForPoll = (): Promise<void> =>
    new Promise((resolve) => {
      const complete = (): void => {
        wakePoll = undefined;
        resolve();
      };
      const timer = setTimeout(complete, options.pollIntervalMs);
      wakePoll = () => {
        clearTimeout(timer);
        return complete();
      };
    });

  const start = (): Promise<void> => {
    if (loopPromise !== undefined) return loopPromise;
    const loop = (async () => {
      try {
        while (!stopping) {
          void (await options.runOnce());
          if (!stopping) await waitForPoll();
        }
        return;
      } finally {
        await finishShutdownOnce();
      }
    })();
    loopPromise = loop;
    return loop;
  };

  const stop = (): Promise<void> => {
    if (stoppingPromise !== undefined) return stoppingPromise;
    stoppingPromise = (async () => {
      stopping = true;
      wakePoll?.();
      await finishShutdownOnce();
      if (loopPromise !== undefined) {
        return await loopPromise;
      }
      return;
    })();
    return stoppingPromise;
  };

  return Object.freeze({ start, stop });
};

export type PilotWorkerDependencies = Readonly<{
  createDatabase: (connectionString: string) => DatabaseResource;
  createRepository: (database: Database) => WorkflowRepository;
  createAdapter: (
    repositoriesRoot: string,
    shutdownTimeoutMs: number,
    verifierId: OmpApprovedVerifierId,
    verifierImageDigest: string
  ) => OmpCliAdapter;
  createWayfinderAdapter: (
    input: Readonly<{
      omp: OmpCliAdapter;
      repositoriesRoot: string;
    }>
  ) => WayfinderExecutionPort;
  createRuntime: (
    input: Readonly<{
      repository: WorkflowRepository;
      adapter: OmpCliAdapter;
      wayfinderAdapter: WayfinderExecutionPort;
      leaseOwner: string;
      authorizeRepository: (ownerId: string, repositoryId: string) => boolean;
    }>
  ) => WorkflowRuntime;
}>;

const createDefaultAdapter: PilotWorkerDependencies["createAdapter"] = (
  repositoriesRoot,
  shutdownTimeoutMs,
  verifierId,
  verifierImageDigest
) => {
  return createOmpCliAdapter({
    repositoriesRoot,
    shutdownTimeoutMs,
    verifierId,
    verifierImageDigest,
  });
};

const defaultDependencies: PilotWorkerDependencies = Object.freeze({
  createDatabase: (connectionString) =>
    createNodeDatabase({
      connectionString,
      maxConnections: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    }),
  createRepository: createWorkflowRepository,
  createAdapter: createDefaultAdapter,
  createWayfinderAdapter: createLocalWayfinderExecutionAdapter,
  createRuntime: (input) => createWorkflowRuntime(input),
});

export const createPilotWorker = async (
  configuration: PilotWorkerConfiguration,
  dependencies: PilotWorkerDependencies = defaultDependencies
): Promise<PilotPollingWorker> => {
  const database = dependencies.createDatabase(configuration.connectionString);
  try {
    const repository = dependencies.createRepository(database.db);
    const processShutdownTimeoutMs = Math.max(
      1,
      Math.floor(configuration.shutdownTimeoutMs / 2)
    );
    const adapter = dependencies.createAdapter(
      configuration.repositoriesRoot,
      processShutdownTimeoutMs,
      configuration.verifierId,
      configuration.verifierImageDigest
    );
    const wayfinderAdapter = dependencies.createWayfinderAdapter({
      omp: adapter,
      repositoriesRoot: configuration.repositoriesRoot,
    });
    const authorizeRepository = (
      ownerId: string,
      repositoryId: string
    ): boolean => {
      return isWorkflowRepositoryGranted(
        configuration.repositoryGrants,
        ownerId,
        repositoryId
      );
    };
    const runtime = dependencies.createRuntime({
      repository,
      adapter,
      wayfinderAdapter,
      leaseOwner: configuration.leaseOwner,
      authorizeRepository,
    });
    return createPilotPollingWorker({
      runOnce: runtime.runOnce,
      stopRuntime: runtime.stop,
      close: database.close,
      pollIntervalMs: configuration.pollIntervalMs,
      shutdownTimeoutMs: configuration.shutdownTimeoutMs,
    });
  } catch (error) {
    await database.close();
    throw error;
  }
};

export type PilotSignalSource = Readonly<{
  on: (signal: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
  off: (signal: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
}>;

export const runPilotWorker = async (
  worker: PilotPollingWorker,
  signals: PilotSignalSource = process
): Promise<void> => {
  const stop = (): void => {
    void worker.stop().catch(() => undefined);
  };
  signals.on("SIGINT", stop);
  signals.on("SIGTERM", stop);
  try {
    await worker.start();
  } finally {
    signals.off("SIGINT", stop);
    signals.off("SIGTERM", stop);
    await worker.stop();
  }
};

export const runPilotWorkerMain = async (
  environment: NodeJS.ProcessEnv = process.env
): Promise<void> => {
  const worker = await createPilotWorker(
    parsePilotWorkerEnvironment(environment)
  );
  await runPilotWorker(worker);
};
