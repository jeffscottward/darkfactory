import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withoutGitRepositoryEnvironment } from "../lib/git-env.ts";
import { nodeInitDependencies } from "./system.ts";

const roots: string[] = [];
const temporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "init-system-"));
  roots.push(root);
  return root;
};

// Mirrors what Git exports to hooks; restored after every test.
const HOOK_KEYS = ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"] as const;
const savedHookEnvironment = Object.fromEntries(
  HOOK_KEYS.map((key) => [key, process.env[key]])
);
const restoreHookEnvironment = (): void => {
  for (const key of HOOK_KEYS) {
    const value = savedHookEnvironment[key];
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
};

const git = (cwd: string, ...arguments_: string[]): string =>
  execFileSync(
    "git",
    [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      ...arguments_,
    ],
    { cwd, encoding: "utf8", env: withoutGitRepositoryEnvironment() }
  ).trim();

const committedRepository = async (name: string): Promise<string> => {
  const root = await temporaryRoot();
  git(root, "init", "--quiet", "--initial-branch=main");
  await writeFile(join(root, "README.md"), `${name}\n`);
  git(root, "add", "README.md");
  git(root, "commit", "--quiet", "--no-verify", "-m", `${name} root`);
  return root;
};

afterEach(async () => {
  restoreHookEnvironment();
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("nodeInitDependencies", () => {
  it("captures output and failures in the repository root", async () => {
    const root = await temporaryRoot();
    const dependencies = nodeInitDependencies(root);
    const success = await dependencies.capture(process.execPath, [
      "-e",
      "process.stdout.write(process.cwd()); process.stderr.write('warn')",
    ]);
    expect(success).toEqual({ exitCode: 0, stdout: root, stderr: "warn" });
    const failure = await dependencies.capture(process.execPath, [
      "-e",
      "process.stderr.write('bad'); process.exit(4)",
    ]);
    expect(failure).toEqual({ exitCode: 1, stdout: "", stderr: "bad" });
  });

  it("runs captured and streamed commands without Git's hook repository variables", async () => {
    const root = await temporaryRoot();
    const dependencies = nodeInitDependencies(root);
    process.env["GIT_DIR"] = "/outer/.git";
    process.env["GIT_INDEX_FILE"] = "/outer/.git/index";
    process.env["GIT_WORK_TREE"] = "/outer";
    const probe =
      "process.stdout.write(JSON.stringify([process.env.GIT_DIR ?? null, process.env.GIT_INDEX_FILE ?? null, process.env.GIT_WORK_TREE ?? null, process.cwd()]))";
    const captured = await dependencies.capture(process.execPath, [
      "-e",
      probe,
    ]);
    expect(JSON.parse(captured.stdout)).toEqual([null, null, null, root]);
    const check =
      "process.exit(process.env.GIT_DIR || process.env.GIT_INDEX_FILE || process.env.GIT_WORK_TREE ? 9 : 0)";
    expect(await dependencies.run(process.execPath, ["-e", check])).toBe(0);
  });

  it("REGRESSION: commits into its target clone, never the hook's outer repository", async () => {
    const outer = await committedRepository("outer");
    const clone = await committedRepository("clone");
    const outerGitDirectory = join(outer, ".git");
    const outerIndex = join(outerGitDirectory, "index");
    const outerHead = git(outer, "rev-parse", "HEAD");
    const outerIndexBytes = await readFile(outerIndex);
    const cloneHead = git(clone, "rev-parse", "HEAD");

    // Reproduce the pre-push environment: Git exports these to hooks.
    process.env["GIT_DIR"] = outerGitDirectory;
    process.env["GIT_INDEX_FILE"] = outerIndex;
    // The trap is armed: an unsanitized git in the clone resolves the outer repo.
    expect(
      execFileSync("git", ["rev-parse", "--absolute-git-dir"], {
        cwd: clone,
        encoding: "utf8",
      }).trim()
    ).toBe(
      execFileSync("git", ["-C", outer, "rev-parse", "--absolute-git-dir"], {
        encoding: "utf8",
        env: withoutGitRepositoryEnvironment(),
      }).trim()
    );

    const dependencies = nodeInitDependencies(clone);
    await dependencies.files.write("README.md", "initialized\n");
    await dependencies.files.write("added.txt", "new\n");
    expect(
      await dependencies.capture("git", ["add", "--all", "--", "."])
    ).toMatchObject({ exitCode: 0 });
    expect(
      await dependencies.run("git", [
        "-c",
        "user.name=init",
        "-c",
        "user.email=init@example.com",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--quiet",
        "--no-verify",
        "-m",
        "chore: initialize project",
      ])
    ).toBe(0);
    restoreHookEnvironment();

    expect(git(outer, "rev-parse", "HEAD")).toBe(outerHead);
    expect(git(outer, "log", "-1", "--format=%s")).toBe("outer root");
    expect(await readFile(outerIndex)).toEqual(outerIndexBytes);
    expect(git(outer, "status", "--porcelain")).toBe("");
    expect(git(clone, "rev-parse", "HEAD~1")).toBe(cloneHead);
    expect(git(clone, "log", "-1", "--format=%s %an")).toBe(
      "chore: initialize project init"
    );
    expect(git(clone, "ls-files").split("\n").sort()).toEqual([
      "README.md",
      "added.txt",
    ]);
    expect(git(clone, "status", "--porcelain")).toBe("");
  });

  it("streams commands and maps exit codes, signals and missing executables", async () => {
    const dependencies = nodeInitDependencies(await temporaryRoot());
    expect(
      await dependencies.run(process.execPath, ["-e", "process.exit(0)"])
    ).toBe(0);
    expect(
      await dependencies.run(process.execPath, ["-e", "process.exit(6)"])
    ).toBe(6);
    expect(
      await dependencies.run(process.execPath, [
        "-e",
        "process.kill(process.pid, 'SIGKILL')",
      ])
    ).toBe(1);
    expect(await dependencies.run("init-missing-executable", [])).toBe(127);
  });

  it("reads, writes, moves and removes files, pruning emptied directories", async () => {
    const root = await temporaryRoot();
    const { files } = nodeInitDependencies(root);
    await mkdir(join(root, "a/b"), { recursive: true });
    await mkdir(join(root, "keep"), { recursive: true });
    await writeFile(join(root, "keep/other.txt"), "other");
    await writeFile(join(root, "a/b/file.txt"), "before");

    expect(new TextDecoder().decode(await files.read("a/b/file.txt"))).toBe(
      "before"
    );
    await files.write("a/b/file.txt", "after");
    await files.move("a/b/file.txt", "c/d/file.txt");
    expect(await readFile(join(root, "c/d/file.txt"), "utf8")).toBe("after");
    expect((await readdir(root)).sort()).toEqual(["c", "keep"]);

    await files.move("keep/other.txt", "keep/renamed.txt");
    await files.write("top.txt", "top");
    await files.move("top.txt", "moved.txt");
    await files.remove("c/d/file.txt");
    await files.remove("moved.txt");
    await files.remove("missing.txt");
    expect(await readdir(root)).toEqual(["keep"]);
    expect(await readdir(join(root, "keep"))).toEqual(["renamed.txt"]);
  });

  it("reports the current year and writes lines to stdout and stderr", () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const dependencies = nodeInitDependencies(".");
    dependencies.log("hello");
    dependencies.error("oops");
    expect(stdout).toHaveBeenCalledWith("hello\n");
    expect(stderr).toHaveBeenCalledWith("oops\n");
    expect(dependencies.year).toBe(new Date().getFullYear());
  });
});
