import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withoutGitRepositoryEnvironment } from "../lib/git-env.ts";
import { type InitDependencies, regularFilesOf, runInit } from "./apply.ts";
import { isBinary, parseInitArguments, planInit } from "./plan.ts";
import { nodeInitDependencies } from "./system.ts";

const originalArguments = [...process.argv];
const originalExitCode = process.exitCode;
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
// Git hooks export GIT_DIR/GIT_INDEX_FILE; the clone must never inherit them.
const cloneEnvironment = withoutGitRepositoryEnvironment(process.env);
const IDENTITY_ARGUMENTS = [
  "--name",
  "Acme Labs",
  "--slug",
  "acme-labs",
  "--scope",
  "@acme",
  "--domain",
  "acme.dev",
  "--repo",
  "acme/acme-labs",
];
const TEMPLATE_IDENTITY = /darkfactory|jeffscott/giu;
// Tracked text that may keep a template-identity match after init, with the
// reason. Keep it empty: every entry is identity leaking into a new project.
const ALLOWED_LEFTOVERS: readonly string[] = [];

// A clone that never starts background Git work. `git commit` runs a detached
// `git maintenance run --auto`, which once kept writing `.git` while the test
// deleted it (ENOTEMPTY); a user-enabled fsmonitor daemon would do the same.
const QUIET_GIT = [
  "--config=gc.auto=0",
  "--config=maintenance.auto=false",
  "--config=core.fsmonitor=false",
];
const cloneRepository = (
  clone: string,
  source: string = repositoryRoot,
  options: readonly string[] = ["--local", "--no-hardlinks"]
): void => {
  execFileSync(
    "git",
    ["clone", "--quiet", ...options, ...QUIET_GIT, source, clone],
    { env: cloneEnvironment }
  );
};
// Retries only cover a filesystem still settling; nothing runs in the clone.
const removeClone = (directory: string): Promise<void> =>
  rm(directory, { recursive: true, force: true, maxRetries: 3 });
const gitIn = (cwd: string, ...arguments_: string[]): string =>
  execFileSync("git", arguments_, {
    cwd,
    encoding: "utf8",
    env: cloneEnvironment,
    maxBuffer: 64 * 1024 * 1024,
  });

/** Runs init with its output captured, so a failure can show the tail. */
const runCaptured = async (
  arguments_: readonly string[],
  dependencies: InitDependencies
): Promise<Readonly<{ failure: string | undefined; errors: string }>> => {
  const output: string[] = [];
  const errors: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    errors.push(String(chunk));
    return true;
  });
  const exitCode = await runInit(arguments_, dependencies);
  return {
    failure:
      exitCode === 0
        ? undefined
        : `bun run init ${arguments_.join(" ")} exited ${exitCode}\n${output.join("").slice(-6000)}`,
    errors: errors.join(""),
  };
};

const stubGitIdentity = (): void => {
  // --fresh-history commits with the caller's Git identity.
  vi.stubEnv("GIT_AUTHOR_NAME", "init");
  vi.stubEnv("GIT_AUTHOR_EMAIL", "init@example.com");
  vi.stubEnv("GIT_COMMITTER_NAME", "init");
  vi.stubEnv("GIT_COMMITTER_EMAIL", "init@example.com");
};

afterEach(() => {
  process.argv = [...originalArguments];
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  return vi.resetModules();
});

describe("bun run init", () => {
  it("renames a clone of this repository with no template identity left", async () => {
    const directory = await mkdtemp(join(tmpdir(), "init-clone-"));
    try {
      const clone = join(directory, "project");
      cloneRepository(clone);
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const dependencies = nodeInitDependencies(clone);

      expect(
        await runInit([...IDENTITY_ARGUMENTS, "--skip-install"], dependencies)
      ).toBe(0);

      const paths = regularFilesOf(
        execFileSync("git", ["ls-files", "-s", "-z"], {
          cwd: clone,
          encoding: "utf8",
          env: cloneEnvironment,
          maxBuffer: 64 * 1024 * 1024,
        })
      );
      const files = await Promise.all(
        paths.map(async (path) => ({
          path,
          bytes: new Uint8Array(await readFile(join(clone, path))),
        }))
      );
      const leftovers: string[] = [];
      for (const { path, bytes } of files) {
        if (TEMPLATE_IDENTITY.test(path)) leftovers.push(`${path} (path)`);
        TEMPLATE_IDENTITY.lastIndex = 0;
        if (isBinary(bytes)) continue;
        const count =
          new TextDecoder().decode(bytes).match(TEMPLATE_IDENTITY)?.length ?? 0;
        if (count > 0) leftovers.push(`${path}: ${count}`);
      }
      expect(
        leftovers.filter((entry) => !ALLOWED_LEFTOVERS.includes(entry))
      ).toEqual([]);
      expect(paths).not.toContain("scripts/init/plan.ts");
      expect(paths).not.toContain(".bestpractices.json");

      // Planning the renamed tree again is a no-op.
      const parsed = parseInitArguments(IDENTITY_ARGUMENTS, dependencies.year);
      if (parsed.kind !== "options") throw new Error("identity rejected");
      expect(planInit(parsed.options.identity, files)).toEqual({
        edits: [],
        renames: [],
        deletions: [],
      });

      // A committed, initialized project refuses a second run.
      execFileSync(
        "git",
        [
          "-c",
          "user.name=init",
          "-c",
          "user.email=init@example.com",
          "commit",
          "--quiet",
          "--no-verify",
          "-m",
          "chore: initialize project",
        ],
        { cwd: clone, env: cloneEnvironment }
      );
      const stderr = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      expect(await runInit(IDENTITY_ARGUMENTS, dependencies)).toBe(1);
      expect(stderr).toHaveBeenCalledWith(
        "This project is already initialized (capabilities.yaml project.slug is acme-labs); pass --force to re-run.\n"
      );
    } finally {
      await removeClone(directory);
    }
  }, 180_000);

  it("turns a plain clone into one fresh, operator-free commit that passes check and tests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "init-fresh-"));
    const clone = join(directory, "project");
    stubGitIdentity();
    // The clone's own Vitest and Turbo runs must not see this Vitest worker.
    const environment = Object.fromEntries(
      Object.entries(withoutGitRepositoryEnvironment(process.env)).filter(
        ([key]) => !(key.startsWith("VITEST") || key === "NODE_ENV")
      )
    );
    const failures: string[] = [];
    const execute = async (
      command: string,
      arguments_: readonly string[]
    ): Promise<number> => {
      try {
        await promisify(execFile)(command, [...arguments_], {
          cwd: clone,
          env: environment,
          maxBuffer: 256 * 1024 * 1024,
        });
        return 0;
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string };
        failures.push(
          `${command} ${arguments_.join(" ")}\n${`${failure.stdout}${failure.stderr}`.slice(-6000)}`
        );
        return 1;
      }
    };
    try {
      cloneRepository(clone);
      const git = (...arguments_: string[]): string =>
        gitIn(clone, ...arguments_);
      const head = git("rev-parse", "HEAD").trim();

      const init = await runCaptured(
        [...IDENTITY_ARGUMENTS, "--without-operator", "--fresh-history"],
        { ...nodeInitDependencies(clone), run: execute }
      );
      if (init.failure !== undefined) failures.push(init.failure);
      // Each failure carries its command and output tail.
      expect(failures).toEqual([]);
      expect(init.errors).toBe("");

      // One root commit, and no ref, remote or tag reaches the old history.
      expect(git("rev-list", "--all", "--count").trim()).toBe("1");
      expect(git("for-each-ref", `--contains=${head}`)).toBe("");
      expect(git("for-each-ref", `--merged=${head}`)).toBe("");
      expect(git("remote")).toBe("");
      expect(git("tag", "--list")).toBe("");
      expect(git("status", "--porcelain")).toBe("");

      // Nothing of the agent-SDLC plane is left to import, run or configure.
      const paths = regularFilesOf(git("ls-files", "-s", "-z"));
      const read = (path: string): Promise<string> =>
        readFile(join(clone, path), "utf8");
      const manifests = paths.filter((path) =>
        /^(?:apps|packages)\/[^/]+\/package\.json$/u.test(path)
      );
      expect(manifests.length).toBeGreaterThan(5);
      for (const path of manifests) {
        expect(JSON.parse(await read(path)).brick).not.toBe("agent-sdlc");
      }
      expect(paths).not.toContain("docs/operator.md");
      const root = JSON.parse(await read("package.json")) as Record<
        string,
        Record<string, string>
      >;
      expect(
        JSON.stringify([root["scripts"], root["devDependencies"]])
      ).not.toMatch(/operator|@acme\/jobs/u);
      expect(await read(".env.example")).not.toMatch(/WORKFLOW_/u);
      expect(await read("packages/config/src/server.ts")).not.toMatch(
        /WORKFLOW_/u
      );

      // The renamed project passes its own gates; typecheck (in `check`)
      // fails on any import of a deleted package.
      for (const script of [
        "check",
        "docs:check",
        "test:unit",
        "test:operations",
      ]) {
        await execute("bun", ["run", script]);
      }
      expect(failures).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await removeClone(directory);
    }
  }, 900_000);

  it("replaces the history of a shallow, detached clone, as CI checks out", async () => {
    const directory = await mkdtemp(join(tmpdir(), "init-shallow-"));
    stubGitIdentity();
    try {
      // CI checks out one commit, detached, with no local branch.
      const source = join(directory, "source");
      cloneRepository(source, pathToFileURL(repositoryRoot).href, [
        "--depth=1",
      ]);
      gitIn(source, "checkout", "--quiet", "--detach");
      for (const branch of gitIn(
        source,
        "for-each-ref",
        "--format=%(refname)",
        "refs/heads"
      )
        .split("\n")
        .filter((ref) => ref !== "")) {
        gitIn(source, "update-ref", "-d", branch);
      }
      const clone = join(directory, "project");
      cloneRepository(clone, source);
      expect(gitIn(clone, "rev-parse", "--is-shallow-repository").trim()).toBe(
        "true"
      );
      const head = gitIn(clone, "rev-parse", "HEAD").trim();

      const init = await runCaptured(
        [...IDENTITY_ARGUMENTS, "--fresh-history", "--skip-install"],
        nodeInitDependencies(clone)
      );
      expect(init.failure).toBeUndefined();
      expect(init.errors).toBe("");
      expect(gitIn(clone, "rev-list", "--all", "--count").trim()).toBe("1");
      expect(gitIn(clone, "symbolic-ref", "HEAD").trim()).toBe(
        "refs/heads/main"
      );
      expect(gitIn(clone, "for-each-ref", `--contains=${head}`)).toBe("");
      expect(gitIn(clone, "for-each-ref", `--merged=${head}`)).toBe("");
      expect(gitIn(clone, "remote")).toBe("");
      expect(gitIn(clone, "tag", "--list")).toBe("");
      expect(gitIn(clone, "status", "--porcelain")).toBe("");
    } finally {
      vi.unstubAllEnvs();
      await removeClone(directory);
    }
  }, 180_000);
});
