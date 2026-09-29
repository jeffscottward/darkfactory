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
import { nodeInitDependencies } from "./system.ts";

const roots: string[] = [];
const temporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "init-system-"));
  roots.push(root);
  return root;
};

afterEach(async () => {
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
