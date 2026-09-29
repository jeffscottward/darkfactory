import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative } from "node:path";

const CONFIG_PATH = "/opt/darkfactory-verifier/checks.json";
const SOURCE_WORKSPACE = "/workspace";
const EXECUTION_WORKSPACE = "/output/workspace";
const RESULT_PATH = "/output/result.json";
const CHECK_IDENTITY = "darkfactory-verifier-checks-v1";
const CONFIG_DIGEST =
  "d2799b335dd76e228f22ef6fd168364ad9c1c37f26ed8b07ce1eb4d06b2a5c8e";
const ARGV_DIGEST =
  "0970fa90d3ab277f28b29a75762d2e81be2a9b60fc280d4122a663ac57ff2eff";
const EXECUTABLES = Object.freeze({
  biome: "/opt/darkfactory-verifier/dependencies/node_modules/.bin/biome",
  bun: "/usr/local/bin/bun",
  "markdownlint-cli2":
    "/opt/darkfactory-verifier/dependencies/node_modules/.bin/markdownlint-cli2",
  tsc: "/opt/darkfactory-verifier/dependencies/node_modules/.bin/tsc",
  vinext: "/opt/darkfactory-verifier/dependencies/node_modules/.bin/vinext",
  vitest: "/opt/darkfactory-verifier/dependencies/node_modules/.bin/vitest",
} as const);

type ExecutableName = keyof typeof EXECUTABLES;
type CheckCommand = Readonly<{
  id: string;
  executable: ExecutableName;
  args: readonly string[];
  cwd: string;
}>;
type CheckConfiguration = Readonly<{
  identity: typeof CHECK_IDENTITY;
  commands: readonly CheckCommand[];
}>;

const fail = (message: string): never => {
  throw new Error(message);
};

const exactArguments = Object.freeze([
  "/usr/local/bin/bun",
  "/opt/darkfactory-verifier/runner.ts",
  "--config",
  CONFIG_PATH,
  "--workspace",
  SOURCE_WORKSPACE,
  "--output",
  RESULT_PATH,
] as const);
if (
  JSON.stringify(Bun.argv) !== JSON.stringify(exactArguments) ||
  createHash("sha256").update(JSON.stringify(exactArguments)).digest("hex") !==
    ARGV_DIGEST
) {
  fail("verifier argv identity changed");
}

const cleanEnvironment = Object.freeze({
  CI: "1",
  HOME: "/tmp/home",
  NODE_ENV: "test",
  NODE_PATH: "/opt/darkfactory-verifier/dependencies/node_modules",
  NO_COLOR: "1",
  PATH: "/opt/darkfactory-verifier/dependencies/node_modules/.bin:/usr/local/bin:/usr/bin:/bin",
  TMPDIR: "/tmp",
  XDG_CACHE_HOME: "/cache",
  XDG_CONFIG_HOME: "/cache/config",
  XDG_DATA_HOME: "/cache/data",
});

const run = async (argv: readonly string[], cwd: string): Promise<void> => {
  const child = Bun.spawn([...argv], {
    cwd,
    env: cleanEnvironment,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    fail(`verifier command failed with exit ${exitCode}`);
  }
};

await mkdir("/tmp/home", { recursive: true });
await mkdir("/cache/config", { recursive: true });
await mkdir("/cache/data", { recursive: true });
await run(
  [
    "/bin/cp",
    "-a",
    "--no-preserve=ownership",
    `${SOURCE_WORKSPACE}/.`,
    EXECUTION_WORKSPACE,
  ],
  "/output"
);

const rawConfiguration = await readFile(CONFIG_PATH, "utf8");
if (
  createHash("sha256").update(rawConfiguration).digest("hex") !== CONFIG_DIGEST
) {
  fail("verifier config digest changed");
}
const configuration = JSON.parse(rawConfiguration) as CheckConfiguration;
if (
  configuration.identity !== CHECK_IDENTITY ||
  !Array.isArray(configuration.commands) ||
  configuration.commands.length === 0 ||
  configuration.commands.length > 64
) {
  fail("verifier config identity changed");
}

const ids = new Set<string>();
for (const command of configuration.commands) {
  if (
    typeof command.id !== "string" ||
    !/^[a-z0-9-]{1,64}$/u.test(command.id) ||
    ids.has(command.id) ||
    !(command.executable in EXECUTABLES) ||
    !Array.isArray(command.args) ||
    !command.args.every((argument) => {
      return (
        typeof argument === "string" &&
        argument.length > 0 &&
        !argument.includes("\0")
      );
    }) ||
    typeof command.cwd !== "string"
  ) {
    fail("verifier config is invalid");
  }
  ids.add(command.id);
  const cwd = normalize(join(EXECUTION_WORKSPACE, command.cwd));
  const child = relative(EXECUTION_WORKSPACE, cwd);
  if (
    cwd !== EXECUTION_WORKSPACE &&
    (child === ".." || child.startsWith("../") || isAbsolute(child))
  ) {
    fail("verifier cwd escapes workspace");
  }
  const args = command.args.map((argument) => {
    return argument.replaceAll("{workspace}", EXECUTION_WORKSPACE);
  });
  process.stdout.write(`check:${command.id}\n`);
  await run([EXECUTABLES[command.executable], ...args], cwd);
}

const result = JSON.stringify({
  identity: "darkfactory-verifier-result-v1",
  status: "passed",
  checks: configuration.commands.length,
});
await writeFile(RESULT_PATH, result, { encoding: "utf8", flag: "wx" });
process.stdout.write(`${result}\n`);
