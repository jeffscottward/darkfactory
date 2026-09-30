import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
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
  // vinext is a web-app dependency, so its bin lives with apps/web.
  vinext:
    "/opt/darkfactory-verifier/dependencies/apps/web/node_modules/.bin/vinext",
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

// The worker keeps at most 32 KiB of verifier output, and a build alone prints
// more. Passing checks stay quiet; a failing one prints the tail of its output.
const FAILURE_TAIL_BYTES = 12 * 1024;

const collectTail = async (
  stream: ReadableStream<Uint8Array>
): Promise<Buffer> => {
  let tail = Buffer.alloc(0);
  for await (const chunk of stream) {
    tail = Buffer.concat([tail, Buffer.from(chunk)]).subarray(
      -FAILURE_TAIL_BYTES
    );
  }
  return tail;
};

const run = async (argv: readonly string[], cwd: string): Promise<void> => {
  const child = Bun.spawn([...argv], {
    cwd,
    env: cleanEnvironment,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    collectTail(child.stdout),
    collectTail(child.stderr),
    child.exited,
  ]);
  if (exitCode !== 0) {
    process.stderr.write(
      Buffer.concat([stdout, stderr]).subarray(-FAILURE_TAIL_BYTES)
    );
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

// The copied workspace has the source but no node_modules, and Node's ESM
// resolver, Vite and Biome ignore NODE_PATH. So each directory gets its
// installed dependencies from the image, and pnpm's relative @darkfactory
// links are recreated so they resolve to this workspace's source.
const DEPENDENCIES = "/opt/darkfactory-verifier/dependencies";
const isPresent = (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false
  );
const linkDependencies = async (directory: string): Promise<void> => {
  const installed = join(DEPENDENCIES, directory, "node_modules");
  const target = join(EXECUTION_WORKSPACE, directory, "node_modules");
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(installed)) {
    const destination = join(target, entry);
    if (entry === "@darkfactory") {
      await mkdir(destination, { recursive: true });
      for (const name of await readdir(join(installed, entry))) {
        if (!(await isPresent(join(destination, name)))) {
          await symlink(
            await readlink(join(installed, entry, name)),
            join(destination, name)
          );
        }
      }
    } else if (!(await isPresent(destination))) {
      await symlink(join(installed, entry), destination);
    }
  }
};
await linkDependencies("");
for (const group of ["apps", "packages"]) {
  for (const name of await readdir(join(DEPENDENCIES, group))) {
    await linkDependencies(join(group, name));
  }
}

// The source is a git worktree whose .git file points outside the container,
// and checks that list tracked files need a repository: the copy becomes one.
await rm(join(EXECUTION_WORKSPACE, ".git"), { force: true, recursive: true });
for (const gitArguments of [
  ["init", "--quiet"],
  ["add", "--all"],
  [
    "-c",
    "user.name=DarkFactory verifier",
    "-c",
    "user.email=verifier@darkfactory.invalid",
    "commit",
    "--quiet",
    "--no-verify",
    "--message=verifier workspace",
  ],
]) {
  await run(["/usr/bin/git", ...gitArguments], EXECUTION_WORKSPACE);
}

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
