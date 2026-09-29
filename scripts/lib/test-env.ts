import { spawn } from "node:child_process";

// Suites that need Postgres (`test:integration`, `verify:browser`) run against
// the disposable test database, never the app database in `.env`: this sets
// APP_ENV=test and replaces DATABASE_URL with TEST_DATABASE_URL, or the
// compose test role. It prints neither URL.

/** The public, test-only role from infra/docker/postgres.compose.yml. */
export const DEFAULT_TEST_DATABASE_URL =
  "postgresql://darkfactory_test_runner:darkfactory-test-only@127.0.0.1:5432/darkfactory_test_maintenance";

export type TestEnvironmentDependencies = Readonly<{
  env: NodeJS.ProcessEnv;
  /** Runs the command with inherited stdio; resolves its exit code. */
  spawn: (
    command: string,
    arguments_: readonly string[],
    env: NodeJS.ProcessEnv
  ) => Promise<number>;
  error: (line: string) => void;
}>;

/** `env` pointed at the test database; an empty TEST_DATABASE_URL means unset. */
export const testEnvironment = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  ...env,
  APP_ENV: "test",
  DATABASE_URL: env["TEST_DATABASE_URL"] || DEFAULT_TEST_DATABASE_URL,
});

/** `bun scripts/with-test-env.ts <command> [arguments...]` */
export const runWithTestEnvironment = async (
  arguments_: readonly string[],
  dependencies: TestEnvironmentDependencies
): Promise<number> => {
  const [command, ...rest] = arguments_;
  if (command === undefined) {
    dependencies.error(
      "Usage: bun scripts/with-test-env.ts <command> [arguments...]"
    );
    return 2;
  }
  return await dependencies.spawn(
    command,
    rest,
    testEnvironment(dependencies.env)
  );
};

/** A signal-ended child counts as a failure; a missing command exits 127. */
export const spawnInherited: TestEnvironmentDependencies["spawn"] = (
  command,
  arguments_,
  env
) => {
  const { promise, resolve } = Promise.withResolvers<number>();
  const child = spawn(command, [...arguments_], { env, stdio: "inherit" });
  child.once("error", () => resolve(127));
  child.once("exit", (code) => resolve(code ?? 1));
  return promise;
};
