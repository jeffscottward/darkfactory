import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nodeSetupDependencies, nodeSetupFiles } from "./system.ts";

const directories: string[] = [];
const directory = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), "darkfactory-setup-"));
  directories.push(path);
  return path;
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true }))
  );
});

describe("setup filesystem adapter", () => {
  it("creates private files exclusively and replaces them atomically", async () => {
    const root = await directory();
    const path = join(root, ".env");

    expect(await nodeSetupFiles.readText(path)).toBeUndefined();
    expect(await nodeSetupFiles.mode(path)).toBeUndefined();
    await nodeSetupFiles.createPrivate(path, "A=1\n");
    expect(await nodeSetupFiles.readText(path)).toBe("A=1\n");
    expect(await nodeSetupFiles.mode(path)).toBe(0o600);
    await expect(nodeSetupFiles.createPrivate(path, "A=2\n")).rejects.toThrow();

    await chmod(path, 0o644);
    await nodeSetupFiles.replacePrivate(path, "A=3\n");
    expect(await nodeSetupFiles.readText(path)).toBe("A=3\n");
    expect(await nodeSetupFiles.mode(path)).toBe(0o600);
    return expect(await readdir(root)).toEqual([".env"]);
  });

  return it("surfaces unexpected errors and removes a failed replacement's temporary file", async () => {
    const root = await directory();
    const nested = join(root, "directory");
    await mkdir(nested);
    await writeFile(join(root, "file"), "");

    await expect(nodeSetupFiles.readText(nested)).rejects.toMatchObject({
      code: "EISDIR",
    });
    await expect(
      nodeSetupFiles.mode(join(root, "file", "child"))
    ).rejects.toMatchObject({ code: "ENOTDIR" });
    await expect(
      nodeSetupFiles.replacePrivate(nested, "A=1\n")
    ).rejects.toThrow();
    return expect((await readdir(root)).sort()).toEqual(["directory", "file"]);
  });
});

describe("setup process adapter", () => {
  it("captures output and reports failures and missing executables as non-zero", async () => {
    const dependencies = nodeSetupDependencies();
    await expect(
      dependencies.capture(process.execPath, [
        "-e",
        "process.stdout.write('v1.2.3')",
      ])
    ).resolves.toEqual({ exitCode: 0, stdout: "v1.2.3" });
    await expect(
      dependencies.capture(process.execPath, ["-e", "process.exit(3)"])
    ).resolves.toMatchObject({ exitCode: 1 });
    return expect(
      dependencies.capture("darkfactory-missing-executable", [])
    ).resolves.toMatchObject({ exitCode: 1 });
  });

  it("streams commands with the given environment and maps exits", async () => {
    const dependencies = nodeSetupDependencies();
    await expect(
      dependencies.run(
        process.execPath,
        ["-e", "process.exit(process.env.SETUP_EXIT === '4' ? 4 : 0)"],
        { SETUP_EXIT: "4" }
      )
    ).resolves.toBe(4);
    await expect(
      dependencies.run(
        process.execPath,
        ["-e", "process.kill(process.pid, 'SIGTERM')"],
        {}
      )
    ).resolves.toBe(1);
    return expect(
      dependencies.run("darkfactory-missing-executable", [], {})
    ).resolves.toBe(127);
  });

  return it("exposes runtime facts, random secrets, and a line logger", () => {
    const dependencies = nodeSetupDependencies();
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    expect(dependencies.environment).toBe(process.env);
    expect(dependencies.bunVersion).toBe(process.versions["bun"] ?? "");
    expect(dependencies.files).toBe(nodeSetupFiles);
    const first = dependencies.randomSecret();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(dependencies.randomSecret()).not.toBe(first);
    dependencies.log("line");
    return expect(write).toHaveBeenCalledWith("line\n");
  });
});
