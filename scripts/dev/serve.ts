import { DEVELOPMENT_TARGETS, isDevelopmentTarget } from "./targets.ts";

// Runs inside `portless <route> bun scripts/dev.ts <target>` (see the root
// `dev` and `operator:dev` scripts). Portless assigns a hidden port through
// PORT/HOST, but `vinext dev` ignores PORT and only honours --port/--hostname,
// so this adapter forwards them to the app's own `dev` script.
export type ChildProcess = Readonly<{
  kill: (signal: NodeJS.Signals) => void;
  // Resolves with the exit code, or null when a signal ended the child.
  exited: Promise<number | null>;
}>;

export type ServeDependencies = Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  spawn: (command: string, arguments_: readonly string[]) => ChildProcess;
  onSignal: (signal: NodeJS.Signals, handler: () => void) => void;
  writeError: (value: string) => void;
}>;

const FORWARDED_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

export const runDevServer = async (
  arguments_: readonly string[],
  dependencies: ServeDependencies
): Promise<number> => {
  const [target, ...extra] = arguments_;
  if (!isDevelopmentTarget(target) || extra.length > 0) {
    dependencies.writeError("Usage: bun scripts/dev.ts <web|operator>\n");
    return 2;
  }
  const port = dependencies.environment["PORT"];
  if (port === undefined || !/^\d{1,5}$/.test(port)) {
    dependencies.writeError(
      "PORT is missing; start through `bun run dev` or `bun run operator:dev` so portless assigns it.\n"
    );
    return 2;
  }
  const child = dependencies.spawn("pnpm", [
    "--filter",
    DEVELOPMENT_TARGETS[target].packageName,
    "run",
    "dev",
    "--port",
    port,
    "--hostname",
    dependencies.environment["HOST"] ?? "127.0.0.1",
  ]);
  for (const signal of FORWARDED_SIGNALS) {
    dependencies.onSignal(signal, () => child.kill(signal));
  }
  return (await child.exited) ?? 1;
};
