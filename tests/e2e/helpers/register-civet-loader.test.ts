import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const repositoryPath = fileURLToPath(new URL("../../../", import.meta.url));

const NODE_TARGET_KEY = "_DARKFACTORY_E2E_NODE_EXECUTABLE";
const PNPM_TARGET_KEY = "_DARKFACTORY_E2E_PNPM_SCRIPT";
const canonicalTargets = {
  [NODE_TARGET_KEY]: "/trusted/node",
  [PNPM_TARGET_KEY]: "/trusted/pnpm.cjs",
};
type WebServerFixtureModule = Readonly<{
  createE2EServerInvocation: (
    source: Readonly<Record<string, string | undefined>>
  ) => Readonly<{
    command: string;
    arguments: readonly string[];
  }>;
}>;
const runWebServer = (
  environment: NodeJS.ProcessEnv
): SpawnSyncReturns<string> => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      "./tests/e2e/helpers/register-civet-loader.mjs",
      "./tests/e2e/helpers/web-server.civet",
    ],
    {
      cwd: repositoryPath,
      encoding: "utf8",
      env: {
        ...environment,
        HOME: process.env["HOME"] ?? "",
        NODE_NO_WARNINGS: "1",
        NODE_ENV: "test",
        PATH: process.env["PATH"] ?? "",
        PORTLESS_PORT: "",
      },
      timeout: 30_000,
    }
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  return result;
};

afterEach(() => {
  vi.doUnmock("./serialized-lifecycle.ts");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("Civet E2E loader boundary", () => {
  it("reaches a safe validation failure through the exact configured loader", () => {
    const result = runWebServer({
      ...canonicalTargets,
      NODE_ENV: "test",
      APP_ENV: "invalid",
      DATABASE_URL: "",
      E2E_RUN_ADOPTION: "",
      E2E_RUN_ID: "",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Error: E2E lifecycle startup failed during validation.\n"
    );
    expect(`${result.stdout}${result.stderr}`).not.toMatch(
      /ERR_MODULE_NOT_FOUND|owner-lock\.js|APP_ENV=test|DATABASE_URL/iu
    );
  });
  it.each([
    [
      "a missing Node target",
      { [PNPM_TARGET_KEY]: canonicalTargets[PNPM_TARGET_KEY] },
    ],
    [
      "a missing pnpm target",
      { [NODE_TARGET_KEY]: canonicalTargets[NODE_TARGET_KEY] },
    ],
    [
      "a non-absolute Node target",
      {
        [NODE_TARGET_KEY]: "node",
        [PNPM_TARGET_KEY]: canonicalTargets[PNPM_TARGET_KEY],
      },
    ],
    [
      "a non-absolute pnpm target",
      {
        [NODE_TARGET_KEY]: canonicalTargets[NODE_TARGET_KEY],
        [PNPM_TARGET_KEY]: "pnpm.cjs",
      },
    ],
  ])("rejects %s before acquiring lifecycle resources", (_case, targets) => {
    const result = runWebServer({
      ...targets,
      NODE_ENV: "test",
      APP_ENV: "test",
      DATABASE_URL: "postgresql://127.0.0.1/postgres",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Error: E2E lifecycle startup failed during validation.\n"
    );
  });
  it("builds the exact canonical Node and pnpm server invocation", async () => {
    const lifecycleCompletion = new Promise<never>(() => undefined);
    vi.doMock("./serialized-lifecycle.ts", () => ({
      createSerializedLifecycle: () => ({
        completion: lifecycleCompletion,
        control: { requestShutdown: vi.fn(async () => undefined) },
      }),
      isIntentionalLifecycleShutdownInterruption: () => false,
    }));
    vi.spyOn(process, "once").mockReturnValue(process);
    // Dynamic import is intentional: the lifecycle mock must precede module evaluation.
    const webServerModulePath = ["./web-server", "civet"].join(".");
    const { createE2EServerInvocation } = (await import(
      webServerModulePath
    )) as WebServerFixtureModule;

    expect(
      createE2EServerInvocation({
        ...canonicalTargets,
        NODE_ENV: "test",
      })
    ).toStrictEqual({
      command: canonicalTargets[NODE_TARGET_KEY],
      arguments: [
        canonicalTargets[PNPM_TARGET_KEY],
        "exec",
        "portless",
        "darkfactory",
        canonicalTargets[NODE_TARGET_KEY],
        canonicalTargets[PNPM_TARGET_KEY],
        "--filter",
        "@darkfactory/web",
        "run",
        "dev",
      ],
    });
  });
  it("loads the Node preview capture boundary with confined TypeScript fallbacks", () => {
    // Dynamic import is intentional: this test exercises the registered loader boundary.
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--import",
        "./tests/e2e/helpers/register-civet-loader.mjs",
        "--input-type=module",
        "--eval",
        'await import("./tests/e2e/helpers/preview-capture.civet"); process.stdout.write("loaded\\n");',
      ],
      {
        cwd: repositoryPath,
        encoding: "utf8",
        env: {
          HOME: process.env["HOME"] ?? "",
          NODE_ENV: "test",
          NODE_NO_WARNINGS: "1",
          PATH: process.env["PATH"] ?? "",
        },
        timeout: 30_000,
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("loaded\n");
    expect(result.stderr).toBe("");
  });
});
