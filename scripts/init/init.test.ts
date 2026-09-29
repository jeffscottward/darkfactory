import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
  vi.doUnmock("./apply.ts");
  vi.doUnmock("./system.ts");
  return vi.resetModules();
});

describe("bun run init", () => {
  it("forwards arguments and node dependencies from the root wrapper", async () => {
    const dependencies = Object.freeze({ kind: "init-dependencies" });
    const nodeInitDependencies = vi.fn(() => dependencies);
    const runInitMock = vi.fn(async () => 7);
    vi.doMock("./system.ts", () => ({ nodeInitDependencies }));
    vi.doMock("./apply.ts", () => ({ runInit: runInitMock }));
    process.argv = ["bun", "init.ts", "--dry-run"];

    // Importing the entrypoint is the behavior under test (it runs on load).
    await import("../init.ts");

    expect(nodeInitDependencies).toHaveBeenCalledWith(process.cwd());
    expect(runInitMock).toHaveBeenCalledWith(["--dry-run"], dependencies);
    return expect(process.exitCode).toBe(7);
  });

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
});
