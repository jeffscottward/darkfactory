import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDevelopmentSeedIdentity } from "@darkfactory/auth/server";
import { createNodeDatabase, withTransaction } from "@darkfactory/db/server";
import { migrate } from "@darkfactory/db/server/migration";
import {
  createPostgresTestDatabase,
  dropPostgresTestDatabase,
  type PostgresTestDatabase,
} from "@darkfactory/testkit/postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type OwnedProcess,
  ownedProcessTreeExists,
  spawnOwnedProcess,
  terminateOwnedProcessTree,
  terminateOwnedProcessTreeThen,
} from "./helpers/owned-process-tree.ts";
import {
  inheritedEnvironment,
  redactValues,
  type WorkerConfig,
  writeWorkerConfig,
} from "./helpers/worker-env.ts";
import {
  startWorkerWithRetry,
  WorkerExitedBeforeReadinessError,
} from "./helpers/worker-startup.ts";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WEB_DIRECTORY = join(REPOSITORY_ROOT, "apps/web");
const VINEXT_CLI_PATH = join(WEB_DIRECTORY, "node_modules/vinext/dist/cli.js");
const AUTH_SECRET = "worker-runtime-test-secret-at-least-32-chars";
const PASSWORD = "CorrectHorseBatteryStaple!42";
const APP_ORIGIN = "https://darkfactory-worker-test.localhost";
const READINESS_ATTEMPT_TIMEOUT_MILLIS = 5000;
const READINESS_TIMEOUT_MILLIS = 150_000;
const WORKER_TERMINATION_OPTIONS = {
  forceTimeoutMillis: 3000,
  gracefulTimeoutMillis: 3000,
} as const;

let database: PostgresTestDatabase;
let devServer: OwnedProcess | undefined;
let baseUrl = "";
let workerConfig: WorkerConfig | undefined;
let workerBindingValues: readonly string[] = [];
let serverOutput = "";

const availablePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    return server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Failed to reserve a Worker test port");
  }
  await new Promise<void>((resolve, reject) => {
    return server.close((error) =>
      error === undefined ? resolve() : reject(error)
    );
  });
  return address.port;
};

const writeWorkerVars = async (): Promise<void> => {
  const environment = {
    APP_ENV: "test",
    APP_URL: APP_ORIGIN,
    APP_NAME: "DarkFactory",
    DATABASE_PROVIDER: "postgres",
    DATABASE_URL: database.databaseUrl,
    BETTER_AUTH_SECRET: AUTH_SECRET,
    CONTACT_THROTTLE_SECRET: "test-only-contact-throttle-secret-32-characters",
    BETTER_AUTH_URL: APP_ORIGIN,
    WORKFLOW_REPOSITORY_GRANTS: "worker-test-owner=darkfactory",
    EMAIL_TRANSPORT: "preview",
    EMAIL_FROM: "DarkFactory <noreply@domain.test>",
    OTEL_ENABLED: "false",
    OTEL_SERVICE_NAME: "darkfactory-web-worker-test",
  } as const;
  workerBindingValues = [
    database.databaseUrl,
    environment.BETTER_AUTH_SECRET,
    environment.CONTACT_THROTTLE_SECRET,
  ];
  workerConfig = await writeWorkerConfig(WEB_DIRECTORY, environment);
};

const safeDiagnostic = (value: string): string => {
  return redactValues(value, workerBindingValues)
    .replaceAll(PASSWORD, "[PASSWORD]")
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/giu, "[DATABASE_URL]")
    .slice(-24_000);
};

const createWorkerProcessEnvironment = (
  port: number,
  configPath = workerConfig?.configPath ?? ""
): NodeJS.ProcessEnv => ({
  ...inheritedEnvironment(process.env),
  // Bindings come from the temp config's .dev.vars, never apps/web/.dev.vars.
  CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: configPath,
  NODE_ENV: "development",
  FORCE_COLOR: "0",
  HOST: "127.0.0.1",
  PORT: port.toString(),
});

const startWorker = (port: number): OwnedProcess => {
  serverOutput = "";
  const server = spawnOwnedProcess(process.execPath, [VINEXT_CLI_PATH, "dev"], {
    cwd: WEB_DIRECTORY,
    env: createWorkerProcessEnvironment(port),
  });
  const consume = (chunk: Buffer): void => {
    serverOutput = safeDiagnostic(`${serverOutput}${chunk.toString()}`);
  };
  server.stdout.on("data", consume);
  server.stderr.on("data", consume);
  return server;
};

class WorkerReadinessError extends Error {}

const requestWorkerReadiness = async (deadline: number): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(
      READINESS_ATTEMPT_TIMEOUT_MILLIS,
      Math.max(0, deadline - Date.now())
    )
  );
  try {
    return await fetch(`${baseUrl}/api/orpc/preferences/theme/get`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: APP_ORIGIN,
      },
      body: JSON.stringify({ json: {} }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const waitForWorker = async (deadline: number): Promise<void> => {
  const server = devServer;
  if (server === undefined) throw new Error("Worker process was not started");

  while (Date.now() < deadline) {
    if (hasProcessExited(server)) {
      throw new WorkerExitedBeforeReadinessError(
        `Vinext Worker exited before readiness:\n${serverOutput}`
      );
    }

    try {
      const response = await requestWorkerReadiness(deadline);
      if (response.status === 401) {
        await response.body?.cancel();
        return;
      }
      if (response.status === 500) {
        const body = safeDiagnostic(await response.text());
        throw new WorkerReadinessError(
          `Vinext Worker route failed during readiness:\n${body}\n${serverOutput}`
        );
      }
      await response.body?.cancel();
    } catch (error) {
      if (error instanceof WorkerReadinessError) throw error;
    }

    await new Promise((resolve) => {
      return setTimeout(
        resolve,
        Math.min(250, Math.max(0, deadline - Date.now()))
      );
    });
  }

  throw new WorkerReadinessError(
    `Timed out waiting for Vinext Worker route:\n${serverOutput}`
  );
};

type ProcessState = Readonly<{
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
}>;

const hasProcessExited = (server: ProcessState): boolean => {
  return server.exitCode !== null || server.signalCode !== null;
};

const stopWorker = async (
  server: OwnedProcess | undefined = devServer
): Promise<void> => {
  if (server === undefined) return;
  await terminateOwnedProcessTree(server, WORKER_TERMINATION_OPTIONS);
  if (devServer === server) devServer = undefined;
};

const cleanupWorkerResources = async (): Promise<void> => {
  const config = workerConfig;
  if (config !== undefined) {
    await rm(config.directory, { force: true, recursive: true });
    workerConfig = undefined;
  }
  if (database !== undefined) await dropPostgresTestDatabase(database);
};

const cookieFrom = (response: Response): string => {
  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null)
    throw new Error("Expected Better Auth session cookie");
  return setCookie.split(";", 1)[0]!;
};

type ThemeRpcPayload = Readonly<{
  json: Readonly<{
    theme: string;
    fontSize: string;
    density: string;
    radius: string;
    updatedAt: string;
  }>;
  meta: readonly (readonly [1, "updatedAt"])[];
}>;

const rpc = async (
  path: string,
  input: Readonly<Record<string, unknown>>,
  cookie: string,
  meta: readonly (readonly [1, string])[] = []
): Promise<Response> =>
  fetch(`${baseUrl}/api/orpc/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      origin: APP_ORIGIN,
    },
    body: JSON.stringify({
      json: input,
      ...(meta.length === 0 ? {} : { meta }),
    }),
  });

describe("Vinext Cloudflare Worker node-postgres runtime", {
  concurrent: false,
}, () => {
  beforeAll(async () => {
    database = await createPostgresTestDatabase({ runId: "vinext_worker_pg" });
    const migrationDatabase = createNodeDatabase({
      connectionString: database.databaseUrl,
      maxConnections: 1,
    });
    try {
      await migrate(migrationDatabase.db);
    } finally {
      await migrationDatabase.close();
    }

    await writeWorkerVars();
    return await startWorkerWithRetry({
      allocatePort: availablePort,
      deadline: Date.now() + READINESS_TIMEOUT_MILLIS,
      output: () => serverOutput,
      start: (port) => {
        baseUrl = `http://127.0.0.1:${port}`;
        devServer = startWorker(port);
        return devServer;
      },
      stop: stopWorker,
      waitForReady: waitForWorker,
    });
  }, 240_000);

  afterAll(async () => {
    const server = devServer;
    if (server === undefined) {
      await cleanupWorkerResources();
      return;
    }

    try {
      return await terminateOwnedProcessTreeThen(
        server,
        async () => {
          if (ownedProcessTreeExists(server)) {
            throw new Error("Owned Vinext process tree is still running");
          }
          if (devServer === server) devServer = undefined;
          return await cleanupWorkerResources();
        },
        WORKER_TERMINATION_OPTIONS
      );
    } catch (error) {
      const diagnostic = safeDiagnostic(
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      );
      throw new Error(
        `Worker teardown failed; retained test resources:\n${diagnostic}`,
        { cause: error }
      );
    }
  }, 30_000);

  it("runs authenticated typed theme reads and writes through real PostgreSQL", async () => {
    const email = `worker-${database.runId}@domain.test`;
    const anonymousSession = await fetch(`${baseUrl}/api/auth/get-session`, {
      headers: { origin: APP_ORIGIN },
    });
    expect(anonymousSession.status).toBe(200);
    await expect(anonymousSession.json()).resolves.toBeNull();

    const identity = {
      userId: "worker-runtime-user",
      accountId: "worker-runtime-account",
      name: "Worker Runtime Proof",
      email,
      image: "https://darkfactory.localhost/worker-runtime-avatar.svg",
      role: "member",
      password: PASSWORD,
    } as const;
    const setupIdentity = await ensureDevelopmentSeedIdentity(
      {
        environment: "test",
        secret: AUTH_SECRET,
        baseURL: APP_ORIGIN,
        trustedOrigins: [APP_ORIGIN],
      },
      [identity]
    );
    const setupDatabase = createNodeDatabase({
      connectionString: database.databaseUrl,
      maxConnections: 1,
    });
    try {
      await withTransaction(setupDatabase.db, async (transaction) => {
        return await setupIdentity(identity, false, transaction);
      });
    } finally {
      await setupDatabase.close();
    }

    const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP_ORIGIN },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(signIn.status).toBe(200);
    const cookie = cookieFrom(signIn);

    const initial = await rpc("preferences/theme/get", {}, cookie);
    const initialBody = await initial.clone().text();
    expect(initial.status, initialBody).toBe(200);
    const initialPayload = (await initial.json()) as ThemeRpcPayload;
    expect(initialPayload).toEqual({
      json: {
        theme: "system",
        fontSize: "default",
        density: "default",
        radius: "small",
        updatedAt: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
      },
      meta: [[1, "updatedAt"]],
    });

    const updated = await rpc(
      "preferences/theme/update",
      {
        theme: "nord",
        fontSize: "large",
        density: "comfortable",
        radius: "medium",
        expectedUpdatedAt: initialPayload.json.updatedAt,
      },
      cookie,
      [[1, "expectedUpdatedAt"]]
    );
    expect(updated.status).toBe(200);
    const updatedPayload = (await updated.json()) as ThemeRpcPayload;
    expect(updatedPayload).toEqual({
      json: {
        theme: "nord",
        fontSize: "large",
        density: "comfortable",
        radius: "medium",
        updatedAt: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
      },
      meta: [[1, "updatedAt"]],
    });
    expect(updatedPayload.json.updatedAt).not.toBe(
      initialPayload.json.updatedAt
    );

    const reloaded = await rpc("preferences/theme/get", {}, cookie);
    expect(reloaded.status).toBe(200);
    await expect(reloaded.json()).resolves.toEqual(updatedPayload);

    const stored = await database.query<{
      theme: string;
      font_size: string;
      density: string;
      radius: string;
    }>(
      'SELECT theme, font_size, density, radius FROM user_preferences WHERE user_id = (SELECT id FROM "user" WHERE email = $1)',
      [email]
    );
    expect(stored).toEqual([
      {
        theme: "nord",
        font_size: "large",
        density: "comfortable",
        radius: "medium",
      },
    ]);

    const openWorkerConnections = await database.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()"
    );
    return expect(openWorkerConnections).toEqual([{ count: 0 }]);
  }, 60_000);

  it("does not forward unrelated host secrets to the Worker process", () => {
    const previousUnrelated = process.env["UNRELATED_SECRET"];
    const previousProvider = process.env["AWS_SECRET_ACCESS_KEY"];
    process.env["UNRELATED_SECRET"] = "must-not-reach-worker";
    process.env["AWS_SECRET_ACCESS_KEY"] = "must-not-reach-worker-provider";
    try {
      const environment = createWorkerProcessEnvironment(
        43_123,
        "/tmp/worker/wrangler.jsonc"
      );
      expect(environment["CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH"]).toBe(
        "/tmp/worker/wrangler.jsonc"
      );
      expect(environment["UNRELATED_SECRET"]).toBeUndefined();
      expect(environment["AWS_SECRET_ACCESS_KEY"]).toBeUndefined();
      expect(environment["PATH"]).toBe(process.env["PATH"]);
      expect(environment["HOST"]).toBe("127.0.0.1");
      return expect(environment["PORT"]).toBe("43123");
    } finally {
      if (previousUnrelated === undefined) {
        delete process.env["UNRELATED_SECRET"];
      } else process.env["UNRELATED_SECRET"] = previousUnrelated;
      if (previousProvider === undefined) {
        delete process.env["AWS_SECRET_ACCESS_KEY"];
      } else process.env["AWS_SECRET_ACCESS_KEY"] = previousProvider;
    }
  });

  it("stops the exact Vinext process tree before teardown resolves", async () => {
    const server = devServer;
    if (server === undefined) throw new Error("Worker process was not started");
    await stopWorker();
    return expect(ownedProcessTreeExists(server)).toBe(false);
  }, 15_000);

  it("recognizes a signal-terminated Worker as already exited", () => {
    return expect(
      hasProcessExited({
        exitCode: null,
        signalCode: "SIGTERM",
      })
    ).toBe(true);
  });
});
