import { execFile, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chmod, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import type { SetupDependencies } from "./setup.ts";

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const writePrivate = async (
  path: string,
  content: string,
  flag: "wx" | "w"
): Promise<void> => {
  await writeFile(path, content, { encoding: "utf8", flag, mode: 0o600 });
  // The creation mode is filtered by the umask; enforce 0600 explicitly.
  await chmod(path, 0o600);
};

export const nodeSetupFiles: SetupDependencies["files"] = Object.freeze({
  readText: async (path) => {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  },
  createPrivate: (path, content) => writePrivate(path, content, "wx"),
  replacePrivate: async (path, content) => {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writePrivate(temporary, content, "wx");
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  },
  mode: async (path) => {
    try {
      return (await stat(path)).mode & 0o777;
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  },
});

export const nodeSetupDependencies = (): SetupDependencies =>
  Object.freeze({
    environment: process.env,
    bunVersion: process.versions["bun"] ?? "",
    files: nodeSetupFiles,
    capture: (command, arguments_) => {
      const { promise, resolve } =
        Promise.withResolvers<Readonly<{ exitCode: number; stdout: string }>>();
      execFile(
        command,
        [...arguments_],
        { encoding: "utf8", timeout: 10_000, windowsHide: true },
        (error, stdout) =>
          resolve({ exitCode: error ? 1 : 0, stdout: String(stdout) })
      );
      return promise;
    },
    run: (command, arguments_, environment) => {
      const { promise, resolve } = Promise.withResolvers<number>();
      const child = spawn(command, [...arguments_], {
        env: environment,
        stdio: "inherit",
      });
      child.once("error", () => resolve(127));
      child.once("exit", (code) => resolve(code ?? 1));
      return promise;
    },
    randomSecret: () => randomBytes(32).toString("base64url"),
    log: (line) => process.stdout.write(`${line}\n`),
  });
