import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TEST_DATABASE_URL,
  runWithTestEnvironment,
  spawnInherited,
  testEnvironment,
} from "./test-env.ts";

const APP_DATABASE_URL =
  "postgresql://app:app-secret@127.0.0.1:5432/app_development";
const CUSTOM_TEST_URL =
  "postgresql://runner:runner-secret@127.0.0.1:6543/runner_maintenance";
const originalArguments = [...process.argv];
const originalExitCode = process.exitCode;

afterEach(() => {
  process.argv = [...originalArguments];
  process.exitCode = originalExitCode;
  vi.doUnmock("./test-env.ts");
  return vi.resetModules();
});

describe("testEnvironment", () => {
  it("replaces the app database with the compose test role", () => {
    expect(
      testEnvironment({
        APP_ENV: "development",
        DATABASE_URL: APP_DATABASE_URL,
        KEEP: "1",
      })
    ).toEqual({
      APP_ENV: "test",
      DATABASE_URL: DEFAULT_TEST_DATABASE_URL,
      KEEP: "1",
    });
  });

  it("prefers TEST_DATABASE_URL and treats an empty one as unset", () => {
    expect(
      testEnvironment({ TEST_DATABASE_URL: CUSTOM_TEST_URL })["DATABASE_URL"]
    ).toBe(CUSTOM_TEST_URL);
    expect(testEnvironment({ TEST_DATABASE_URL: "" })["DATABASE_URL"]).toBe(
      DEFAULT_TEST_DATABASE_URL
    );
  });

  it("defaults to the test-runner role that the compose file creates", async () => {
    const compose = await readFile(
      new URL("../../infra/docker/postgres.compose.yml", import.meta.url),
      "utf8"
    );
    const url = new URL(DEFAULT_TEST_DATABASE_URL);
    expect(compose).toContain(`CREATE ROLE ${url.username}`);
    expect(compose).toContain(`PASSWORD '${url.password}'`);
    expect(compose).toContain(`POSTGRES_DB: ${url.pathname.slice(1)}`);
  });
});

describe("runWithTestEnvironment", () => {
  it("prints usage without a command", async () => {
    const error = vi.fn();
    const spawn = vi.fn();
    expect(await runWithTestEnvironment([], { env: {}, spawn, error })).toBe(2);
    expect(error).toHaveBeenCalledWith(
      "Usage: bun scripts/with-test-env.ts <command> [arguments...]"
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("runs the command under the test environment and returns its exit code", async () => {
    const spawn = vi.fn(async () => 5);
    expect(
      await runWithTestEnvironment(["pnpm", "exec", "vitest"], {
        env: { DATABASE_URL: APP_DATABASE_URL },
        spawn,
        error: vi.fn(),
      })
    ).toBe(5);
    expect(spawn).toHaveBeenCalledWith("pnpm", ["exec", "vitest"], {
      APP_ENV: "test",
      DATABASE_URL: DEFAULT_TEST_DATABASE_URL,
    });
  });
});

describe("spawnInherited", () => {
  it("passes the environment and the exit code through", async () => {
    expect(
      await spawnInherited(
        process.execPath,
        ["-e", "process.exit(process.env.DATABASE_URL === 'probe' ? 3 : 4)"],
        { DATABASE_URL: "probe" }
      )
    ).toBe(3);
  });

  it("fails a signal-ended child and a missing command", async () => {
    expect(
      await spawnInherited(
        process.execPath,
        ["-e", "process.kill(process.pid, 'SIGTERM')"],
        {}
      )
    ).toBe(1);
    expect(
      await spawnInherited("darkfactory-missing-command", [], process.env)
    ).toBe(127);
  });
});

describe("bun scripts/with-test-env.ts", () => {
  it("forwards arguments and node dependencies from the root wrapper", async () => {
    const runWithTestEnvironmentMock = vi.fn(
      async (
        _arguments: readonly string[],
        dependencies: Readonly<{ error: (line: string) => void }>
      ) => {
        dependencies.error("probe");
        return 6;
      }
    );
    vi.doMock("./test-env.ts", () => ({
      runWithTestEnvironment: runWithTestEnvironmentMock,
      spawnInherited,
    }));
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    process.argv = ["bun", "with-test-env.ts", "pnpm", "exec", "playwright"];

    // Importing the entrypoint is the behavior under test (it runs on load).
    await import("../with-test-env.ts");

    expect(runWithTestEnvironmentMock).toHaveBeenCalledWith(
      ["pnpm", "exec", "playwright"],
      expect.objectContaining({ env: process.env, spawn: spawnInherited })
    );
    expect(stderr).toHaveBeenCalledWith("probe\n");
    stderr.mockRestore();
    return expect(process.exitCode).toBe(6);
  });
});
