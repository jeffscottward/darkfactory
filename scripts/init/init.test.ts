import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withoutGitRepositoryEnvironment } from "../lib/git-env.ts";
import { regularFilesOf, runInit } from "./apply.ts";
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
      execFileSync(
        "git",
        [
          "clone",
          "--quiet",
          "--local",
          "--no-hardlinks",
          repositoryRoot,
          clone,
        ],
        { env: cloneEnvironment }
      );
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
      await rm(directory, { recursive: true, force: true });
    }
  }, 180_000);

  it("turns a plain clone into one fresh, operator-free commit that passes check and tests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "init-fresh-"));
    const clone = join(directory, "project");
    // --fresh-history commits with the caller's Git identity.
    vi.stubEnv("GIT_AUTHOR_NAME", "init");
    vi.stubEnv("GIT_AUTHOR_EMAIL", "init@example.com");
    vi.stubEnv("GIT_COMMITTER_NAME", "init");
    vi.stubEnv("GIT_COMMITTER_EMAIL", "init@example.com");
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
      execFileSync(
        "git",
        [
          "clone",
          "--quiet",
          "--local",
          "--no-hardlinks",
          repositoryRoot,
          clone,
        ],
        { env: cloneEnvironment }
      );
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const errors = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      expect(
        await runInit(
          [...IDENTITY_ARGUMENTS, "--without-operator", "--fresh-history"],
          { ...nodeInitDependencies(clone), run: execute }
        )
      ).toBe(0);
      expect(failures).toEqual([]);
      expect(errors).not.toHaveBeenCalled();

      // One root commit, and no ref, remote or tag reaches the template.
      const git = (...arguments_: string[]): string =>
        execFileSync("git", arguments_, {
          cwd: clone,
          encoding: "utf8",
          env: environment,
          maxBuffer: 64 * 1024 * 1024,
        });
      expect(git("rev-list", "--all", "--count").trim()).toBe("1");
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
      const importsPlane =
        /(?:\bfrom\s*|\bimport\s*\(\s*|\bmock\s*\(\s*)["']@acme\/(?:jobs|operator)\b/u;
      const importers: string[] = [];
      for (const path of paths.filter((path) =>
        /\.[cm]?[jt]sx?$/u.test(path)
      )) {
        if (importsPlane.test(await read(path))) importers.push(path);
      }
      expect(importers).toEqual([]);

      // The renamed project passes its own gates.
      for (const script of [
        "check",
        "docs:check",
        "test:unit",
        "test:operations",
      ]) {
        expect(await execute("bun", ["run", script])).toBe(0);
      }
      expect(failures).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  }, 900_000);
});
