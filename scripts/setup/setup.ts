import { parseEnv } from "node:util";
import { parseMiseToolchain, type ToolchainPins } from "../lib/toolchain.ts";

// `bun run setup`: idempotent first-run bootstrap after `mise install`.
// `bun run setup -- --check` reports the same state without changing it.
export type CommandResult = Readonly<{ exitCode: number; stdout: string }>;

export type SetupDependencies = Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  bunVersion: string;
  files: Readonly<{
    /** Undefined when the file does not exist. */
    readText: (path: string) => Promise<string | undefined>;
    /** Exclusive create with mode 0600; never replaces an existing file. */
    createPrivate: (path: string, content: string) => Promise<void>;
    /** Atomic replacement with mode 0600. */
    replacePrivate: (path: string, content: string) => Promise<void>;
    /** Permission bits, or undefined when the file does not exist. */
    mode: (path: string) => Promise<number | undefined>;
  }>;
  /** Captures a short command's stdout; missing executables report non-zero. */
  capture: (
    command: string,
    arguments_: readonly string[]
  ) => Promise<CommandResult>;
  /** Streams a command to the terminal and resolves its exit code. */
  run: (
    command: string,
    arguments_: readonly string[],
    environment: Readonly<Record<string, string | undefined>>
  ) => Promise<number>;
  randomSecret: () => string;
  log: (line: string) => void;
}>;

export const LOCAL_DATABASE_URL =
  "postgresql://darkfactory_app:darkfactory-app-local-only@127.0.0.1:5432/darkfactory_dev";
const COMPOSE_FILE = "infra/docker/postgres.compose.yml";
const BINDINGS_PATH = "apps/web/.dev.vars";
const GENERATED_SECRETS = [
  "BETTER_AUTH_SECRET",
  "CONTACT_THROTTLE_SECRET",
] as const;

const versionOf = (output: string): string | undefined =>
  /(\d+\.\d+\.\d+)/u.exec(output)?.[1];

// Fills only empty or absent generated values; every other byte is preserved.
export const fillLocalEnvironment = (
  source: string,
  randomSecret: () => string
): Readonly<{ content: string; filled: readonly string[] }> => {
  const values = parseEnv(source);
  const fillers: Record<string, () => string> = {};
  for (const name of GENERATED_SECRETS) fillers[name] = randomSecret;
  // Hyperdrive rejects DATABASE_URL; only URL providers get the local role.
  if ((values["DATABASE_PROVIDER"] ?? "postgres") !== "hyperdrive") {
    fillers["DATABASE_URL"] = () => LOCAL_DATABASE_URL;
  }
  const filled: string[] = [];
  const lines = source.split("\n").map((line) => {
    const name = /^([A-Z][A-Z0-9_]*)=\s*$/u.exec(line)?.[1];
    const fill = name === undefined ? undefined : fillers[name];
    if (name === undefined || fill === undefined || filled.includes(name)) {
      return line;
    }
    filled.push(name);
    return `${name}=${fill()}`;
  });
  for (const [name, fill] of Object.entries(fillers)) {
    // parseEnv reports empty lines as "", so undefined means the line is absent.
    if (values[name] === undefined) {
      if (lines.at(-1) === "") lines.pop();
      lines.push(`${name}=${fill()}`, "");
      filled.push(name);
    }
  }
  return { content: lines.join("\n"), filled };
};

const checkToolchain = async (
  dependencies: SetupDependencies
): Promise<readonly string[]> => {
  const source = await dependencies.files.readText("mise.toml");
  let pins: ToolchainPins;
  try {
    pins = parseMiseToolchain(source ?? "");
  } catch {
    return ["mise.toml is missing or malformed"];
  }
  const node = await dependencies.capture("node", ["--version"]);
  const pnpm = await dependencies.capture("pnpm", ["--version"]);
  const actual: ToolchainPins = {
    node: (node.exitCode === 0 && versionOf(node.stdout)) || "missing",
    bun: versionOf(dependencies.bunVersion) ?? "missing",
    pnpm: (pnpm.exitCode === 0 && versionOf(pnpm.stdout)) || "missing",
  };
  return (["node", "bun", "pnpm"] as const)
    .filter((tool) => actual[tool] !== pins[tool])
    .map(
      (tool) => `${tool} ${actual[tool]} does not match mise.toml ${pins[tool]}`
    );
};

const prepareEnvironmentFile = async (
  dependencies: SetupDependencies,
  checkOnly: boolean,
  problems: string[]
): Promise<void> => {
  const { files, log } = dependencies;
  const existing = await files.readText(".env");
  if (existing === undefined) {
    if (checkOnly) {
      problems.push(".env is missing");
      return;
    }
    const example = await files.readText(".env.example");
    if (example === undefined) {
      problems.push(".env.example is missing");
      return;
    }
    const { content, filled } = fillLocalEnvironment(
      example,
      dependencies.randomSecret
    );
    await files.createPrivate(".env", content);
    log(`✓ created .env (mode 0600); filled ${filled.join(", ")}`);
    return;
  }
  const { content, filled } = fillLocalEnvironment(
    existing,
    dependencies.randomSecret
  );
  const privateMode = (await files.mode(".env")) === 0o600;
  if (checkOnly) {
    if (filled.length > 0) problems.push(`.env has empty ${filled.join(", ")}`);
    if (!privateMode) problems.push(".env is not mode 0600");
    return;
  }
  if (filled.length > 0 || !privateMode) {
    await files.replacePrivate(".env", content);
  }
  log(
    filled.length > 0
      ? `✓ .env kept; filled empty ${filled.join(", ")}`
      : "✓ .env kept"
  );
};

const startPostgres = async (
  dependencies: SetupDependencies
): Promise<void> => {
  const { log } = dependencies;
  const compose = await dependencies.capture("docker", ["compose", "version"]);
  if (compose.exitCode === 0) {
    const started = await dependencies.run(
      "docker",
      ["compose", "-f", COMPOSE_FILE, "up", "--detach", "--wait"],
      dependencies.environment
    );
    if (started === 0) {
      log("✓ PostgreSQL is running (docker compose)");
      return;
    }
    log("! docker compose could not start PostgreSQL");
  } else {
    log("! Docker Compose is not available");
  }
  log(
    `  Start PostgreSQL 17 yourself with the roles in ${COMPOSE_FILE} (or install Docker), point DATABASE_URL in .env at it, then re-run bun run setup.`
  );
};

const prepareDatabase = async (
  dependencies: SetupDependencies,
  problems: string[]
): Promise<void> => {
  await startPostgres(dependencies);
  // Children load the new .env themselves: `db:migrate` passes
  // --env-file and `db:seed` runs Bun from the repository root.
  const { environment } = dependencies;
  if (
    (await dependencies.run("bun", ["run", "db:migrate"], environment)) !== 0
  ) {
    problems.push(
      "migrations failed; is PostgreSQL reachable at DATABASE_URL?"
    );
    return;
  }
  dependencies.log("✓ migrations applied");
  const seeded = await dependencies.run(
    "bun",
    ["run", "db:seed", "--", "--confirm-environment=development"],
    environment
  );
  if (seeded === 0) dependencies.log("✓ development accounts seeded");
  else problems.push("seeding failed; APP_ENV in .env must be development");
};

const prepareBindings = async (
  dependencies: SetupDependencies,
  checkOnly: boolean,
  problems: string[]
): Promise<void> => {
  if (checkOnly) {
    if ((await dependencies.files.mode(BINDINGS_PATH)) === undefined) {
      problems.push(`${BINDINGS_PATH} is missing`);
    }
    return;
  }
  // A child process, because this one started before `pnpm install` created
  // the workspace packages the bindings writer validates with; see
  // scripts/dev/bindings.ts#materializeWorkerBindings.
  const written = await dependencies.run(
    "bun",
    ["scripts/dev-bindings.ts"],
    dependencies.environment
  );
  if (written !== 0) problems.push(`${BINDINGS_PATH} was not written`);
};

// False only when a real install fails; nothing later can work without it.
const installDependencies = async (
  dependencies: SetupDependencies,
  checkOnly: boolean,
  problems: string[]
): Promise<boolean> => {
  if (checkOnly) {
    const marker = await dependencies.files.mode("node_modules/.modules.yaml");
    if (marker === undefined) problems.push("dependencies are not installed");
    return true;
  }
  return (
    (await dependencies.run(
      "pnpm",
      ["install", "--frozen-lockfile"],
      dependencies.environment
    )) === 0
  );
};

export const runSetup = async (
  arguments_: readonly string[],
  dependencies: SetupDependencies
): Promise<number> => {
  const { log } = dependencies;
  const explicit = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  if (
    explicit.length > 1 ||
    (explicit.length === 1 && explicit[0] !== "--check")
  ) {
    log("Usage: bun run setup [-- --check]");
    return 2;
  }
  const checkOnly = explicit[0] === "--check";

  const toolchain = await checkToolchain(dependencies);
  if (toolchain.length > 0) {
    for (const problem of toolchain) log(`✗ ${problem}`);
    log("Run `mise install` (and activate mise in your shell), then re-run.");
    return 1;
  }
  log("✓ toolchain matches mise.toml");

  const problems: string[] = [];
  if (!(await installDependencies(dependencies, checkOnly, problems))) {
    log("✗ pnpm install --frozen-lockfile failed");
    return 1;
  }
  await prepareEnvironmentFile(dependencies, checkOnly, problems);
  if (!checkOnly) await prepareDatabase(dependencies, problems);
  await prepareBindings(dependencies, checkOnly, problems);

  if (problems.length > 0) {
    for (const problem of problems) log(`✗ ${problem}`);
    log(
      checkOnly
        ? "Run bun run setup to fix these."
        : "Fix the items above, then re-run bun run setup (it is idempotent)."
    );
    return 1;
  }
  log(
    checkOnly
      ? "✓ setup is complete"
      : "Ready. Next: bun run dev → https://darkfactory.localhost (portless may ask for sudo once to bind 443 and trust its CA)."
  );
  return 0;
};
